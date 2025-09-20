import { fromArrayBuffer } from 'geotiff';
import {
  LANDCOVER_TAXONOMY_URL,
  SOIL_DATA_EXTENT,
  USE_MOCK_DATA,
  WORLDCOVER_RELEASE,
  type BoundingBox
} from '../config';
import { InFlightMap, TimedCache } from './cache';
import type { LandCoverGrid } from '../types';
import { mockWorldCover } from './mock/worldcover';
import { ensureGeoTiffResponse, wrapGeoTiffDecode } from '../utils/geotiff';
import { isAbortError } from '../utils/errors';

const CACHE_TTL_MS = 1000 * 60 * 30;

const TAXONOMY_FILENAME = 'TAXOUSDA_T36059.tif';
const SOIL_TILE_DIRECTORY = 'public/data/soil';
const SOIL_TILE_INSTRUCTIONS = 'See public/data/soil/README.txt for download instructions.';

function usesBundledAsset(url: string): boolean {
  return /(?:^|\/)data\/soil\//.test(url);
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function appendHint(message: string, hint: string): string {
  if (!hint) {
    return message;
  }
  const trimmed = message.trimEnd();
  const needsPeriod = trimmed.length === 0 ? false : !/[.!?]$/.test(trimmed);
  const suffix = needsPeriod ? `.${hint}` : hint;
  return `${trimmed}${suffix}`;
}

function taxonomyHint(): string {
  if (!usesBundledAsset(LANDCOVER_TAXONOMY_URL)) {
    return '';
  }
  return ` Ensure ${TAXONOMY_FILENAME} is present in ${SOIL_TILE_DIRECTORY}. ${SOIL_TILE_INSTRUCTIONS}`;
}

const TAXOUSDA_LEGEND =
  '0: "Ocean", 1: "Shifting Sand", 2: "Rock", 3: "Ice", 5: "Histels", 6: "Turbels", 7: "Orthels", 10: "Folists", 11: "Fibrists", 12: "Hemists", 13: "Saprists", 15: "Aquods", 16: "Cryods", 17: "Humods", 18: "Orthods", 19: "Gelods", 20: "Aquands", 21: "Cryands", 22: "Torrands", 23: "Xerands", 24: "Vitrands", 25: "Ustands", 26: "Udands", 27: "Gelands", 30: "Aquox", 31: "Torrox", 32: "Ustox", 33: "Perox", 34: "Udox", 40: "Aquerts", 41: "Cryerts", 42: "Xererts", 43: "Torrerts", 44: "Usterts", 45: "Uderts", 50: "Cryids", 51: "Salids", 52: "Durids", 53: "Gypsids", 54: "Argids", 55: "Calcids", 56: "Cambids", 60: "Aquults", 61: "Humults", 62: "Udults", 63: "Ustults", 64: "Xerults", 69: "Borolls", 70: "Albolls", 71: "Aquolls", 72: "Rendolls", 73: "Xerolls", 74: "Cryolls", 75: "Ustolls", 76: "Udolls", 77: "Gelolls", 80: "Aqualfs", 81: "Cryalfs", 82: "Ustalfs", 83: "Xeralfs", 84: "Udalfs", 85: "Udepts", 86: "Gelepts", 89: "Ochrepts", 90: "Aquepts", 91: "Anthrepts", 92: "Cryepts", 93: "Ustepts", 94: "Xerepts", 95: "Aquents", 96: "Arents", 97: "Psamments", 98: "Fluvents", 99: "Orthents"';

const TAXOUSDA_LABELS = new Map<number, string>();
for (const entry of TAXOUSDA_LEGEND.split(',')) {
  const match = entry.match(/(\d+):\s*"([^"]+)"/);
  if (match) {
    TAXOUSDA_LABELS.set(Number.parseInt(match[1], 10), match[2]);
  }
}

type LandDataset = {
  width: number;
  height: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  pixelWidth: number;
  pixelHeight: number;
  codes: Uint16Array;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapSoilTaxonomyToLandCover(code: number): number {
  if (!Number.isFinite(code) || code === 255) {
    return 60;
  }
  const label = TAXOUSDA_LABELS.get(code);
  if (!label) {
    return 40;
  }
  const lower = label.toLowerCase();
  if (lower.includes('ocean')) {
    return 80;
  }
  if (lower.includes('ice')) {
    return 70;
  }
  if (lower.includes('rock')) {
    return 60;
  }
  if (lower.includes('sand')) {
    return 60;
  }
  if (lower.includes('aqu') || lower.includes('hist') || lower.includes('sapr')) {
    return 95;
  }
  if (lower.includes('cry') || lower.includes('gel')) {
    return 90;
  }
  if (lower.includes('psam')) {
    return 30;
  }
  if (lower.includes('ust') || lower.includes('xer')) {
    return 30;
  }
  if (lower.includes('hum') || lower.includes('and') || lower.includes('orthod')) {
    if (lower.includes('sand')) {
      return 60;
    }
    return 20;
  }
  if (lower.endsWith('ids')) {
    return 60;
  }
  if (lower.includes('oll') || lower.includes('alf') || lower.includes('ept') || lower.includes('ent')) {
    return 40;
  }
  return 40;
}

function resampleLandCover(
  dataset: LandDataset,
  bbox: BoundingBox,
  width: number,
  height: number
): Uint8Array {
  const output = new Uint8Array(width * height);
  const lonSpan = bbox.maxLon - bbox.minLon;
  const latSpan = bbox.maxLat - bbox.minLat;
  const { minLon, maxLon, minLat, maxLat, pixelWidth, pixelHeight } = dataset;

  for (let y = 0; y < height; y += 1) {
    const lat = clamp(bbox.maxLat - ((y + 0.5) * latSpan) / height, minLat, maxLat);
    const py = clamp((maxLat - lat) / pixelHeight, 0, dataset.height - 1);
    const row = Math.round(py);
    for (let x = 0; x < width; x += 1) {
      const lon = clamp(bbox.minLon + ((x + 0.5) * lonSpan) / width, minLon, maxLon);
      const px = clamp((lon - minLon) / pixelWidth, 0, dataset.width - 1);
      const col = Math.round(px);
      const code = dataset.codes[row * dataset.width + col];
      output[y * width + x] = mapSoilTaxonomyToLandCover(code);
    }
  }

  return output;
}

export class WorldCoverClient {
  private readonly cache = new TimedCache<LandCoverGrid>(CACHE_TTL_MS);
  private readonly inFlight = new InFlightMap<LandCoverGrid>();
  private datasetPromise: Promise<LandDataset> | null = null;
  private datasetAbort: AbortController | null = null;

  constructor(private readonly useMock = USE_MOCK_DATA) {}

  cancelPending() {
    this.inFlight.cancelAll();
    if (this.datasetAbort) {
      this.datasetAbort.abort();
      this.datasetAbort = null;
    }
    this.datasetPromise = null;
  }

  get releaseLabel() {
    return WORLDCOVER_RELEASE;
  }

  async fetchGrid(bbox: BoundingBox, width: number, height: number): Promise<LandCoverGrid> {
    if (this.useMock) {
      return mockWorldCover(width, height, bbox);
    }
    const key = this.buildKey(bbox, width, height);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing.promise;
    }
    const controller = new AbortController();
    const promise = this.loadAndResample(bbox, width, height, controller.signal)
      .then((grid) => {
        this.cache.set(key, grid);
        this.inFlight.delete(key);
        return grid;
      })
      .catch((error) => {
        this.inFlight.delete(key);
        throw error;
      });

    this.inFlight.set(key, { promise, abort: () => controller.abort() });
    return promise;
  }

  private buildKey(bbox: BoundingBox, width: number, height: number) {
    return [bbox.minLon.toFixed(4), bbox.minLat.toFixed(4), bbox.maxLon.toFixed(4), bbox.maxLat.toFixed(4), width, height].join(':');
  }

  private async loadAndResample(
    bbox: BoundingBox,
    width: number,
    height: number,
    signal: AbortSignal
  ): Promise<LandCoverGrid> {
    const dataset = await this.ensureDataset(signal);
    const codes = resampleLandCover(dataset, bbox, width, height);
    return { width, height, codes };
  }

  private async ensureDataset(signal: AbortSignal): Promise<LandDataset> {
    if (this.datasetPromise) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      signal.addEventListener(
        'abort',
        () => {
          this.datasetAbort?.abort();
        },
        { once: true }
      );
      return this.datasetPromise;
    }

    const controller = new AbortController();
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const promise = this.loadDataset(controller.signal)
      .catch((error) => {
        if (controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        throw error;
      })
      .finally(() => {
        if (this.datasetAbort === controller) {
          this.datasetAbort = null;
        }
        if (this.datasetPromise === promise) {
          this.datasetPromise = null;
        }
      });

    this.datasetPromise = promise;
    this.datasetAbort = controller;
    return promise;
  }

  private async loadDataset(signal: AbortSignal): Promise<LandDataset> {
    const hint = taxonomyHint();
    let response: Response;

    try {
      response = await fetch(LANDCOVER_TAXONOMY_URL, { signal });
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw new Error(
        appendHint(
          `Failed to download land-cover taxonomy raster: ${describeError(error)}`,
          hint
        )
      );
    }

    if (!response.ok) {
      throw new Error(
        appendHint(`Failed to download land-cover taxonomy raster (${response.status})`, hint)
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    try {
      ensureGeoTiffResponse({
        source: 'SoilGrids taxonomy',
        response,
        buffer: arrayBuffer
      });
    } catch (error) {
      throw new Error(appendHint(describeError(error), hint));
    }

    try {
      const tiff = await wrapGeoTiffDecode({
        source: 'SoilGrids taxonomy',
        fn: () => fromArrayBuffer(arrayBuffer)
      });
      const image = await wrapGeoTiffDecode({
        source: 'SoilGrids taxonomy',
        fn: () => tiff.getImage()
      });
      const raster = (await wrapGeoTiffDecode({
        source: 'SoilGrids taxonomy',
        fn: () => image.readRasters({ interleave: true })
      })) as Uint16Array | Uint8Array | Float32Array;
      const codes =
        raster instanceof Uint16Array
          ? raster
          : raster instanceof Uint8Array
          ? Uint16Array.from(raster)
          : Uint16Array.from(raster as ArrayLike<number>);
      const [minLon, minLat, maxLon, maxLat] = image.getBoundingBox();
      const dataset: LandDataset = {
        width: image.getWidth(),
        height: image.getHeight(),
        minLon,
        maxLon,
        minLat,
        maxLat,
        pixelWidth: (maxLon - minLon) / image.getWidth(),
        pixelHeight: (maxLat - minLat) / image.getHeight(),
        codes
      };

      const extentMatches =
        Math.abs(dataset.minLon - SOIL_DATA_EXTENT.minLon) < 0.5 &&
        Math.abs(dataset.maxLon - SOIL_DATA_EXTENT.maxLon) < 0.5 &&
        Math.abs(dataset.minLat - SOIL_DATA_EXTENT.minLat) < 0.5 &&
        Math.abs(dataset.maxLat - SOIL_DATA_EXTENT.maxLat) < 0.5;
      if (!extentMatches) {
        console.warn('Loaded land-cover taxonomy extent differs from expected SoilGrids tile.', {
          expected: SOIL_DATA_EXTENT,
          actual: {
            minLon: dataset.minLon,
            maxLon: dataset.maxLon,
            minLat: dataset.minLat,
            maxLat: dataset.maxLat
          }
        });
      }

      return dataset;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw new Error(appendHint(describeError(error), hint));
    }
  }
}
