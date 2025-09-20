import { fromArrayBuffer } from 'geotiff';
import { SOIL_DATA_EXTENT, SOIL_PROPERTY_URLS, USE_MOCK_DATA, type BoundingBox } from '../config';
import { InFlightMap, TimedCache } from './cache';
import type { SoilGrid, SoilProperty } from '../types';
import { mockSoilGrid } from './mock/soilgrids';
import { ensureGeoTiffResponse, wrapGeoTiffDecode } from '../utils/geotiff';
import { isAbortError } from '../utils/errors';

const PROPERTY_UNITS: Record<SoilProperty, string> = {
  orcdrc: 'g/kg',
  phh2o: 'pH',
  bdod: 'kg/m³',
  sand: 'g/kg',
  clay: 'g/kg',
  silt: 'g/kg'
};

const PROPERTY_FILENAMES: Record<SoilProperty, string> = {
  orcdrc: 'ORCDRC_M_sl1_T36059.tif',
  phh2o: 'PHIHOX_M_sl1_T36059.tif',
  bdod: 'BLD.f_M_sl1_T36059.tif',
  sand: 'SNDPPT_M_sl1_T36059.tif',
  clay: 'CLYPPT_M_sl1_T36059.tif',
  silt: 'SLTPPT_M_sl1_T36059.tif'
};

const SOIL_TILE_DIRECTORY = 'public/data/soil';
const SOIL_TILE_INSTRUCTIONS = 'See public/data/soil/README.txt for download instructions.';

const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

const NODATA_THRESHOLD = -30000;

function usesBundledAsset(url: string): boolean {
  return /(?:^|\/)data\/soil\//.test(url);
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function missingTileHint(property: SoilProperty): string {
  const filename = PROPERTY_FILENAMES[property];
  if (filename) {
    return `Ensure ${filename} is present in ${SOIL_TILE_DIRECTORY}. ${SOIL_TILE_INSTRUCTIONS}`;
  }
  return `Ensure the SoilGrids tile GeoTIFFs exist in ${SOIL_TILE_DIRECTORY}. ${SOIL_TILE_INSTRUCTIONS}`;
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

type SoilDataset = {
  width: number;
  height: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  pixelWidth: number;
  pixelHeight: number;
  data: Record<SoilProperty, Float32Array>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function bilinearSample(
  data: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const clampedX = clamp(x, 0, width - 1);
  const clampedY = clamp(y, 0, height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;

  const idx00 = y0 * width + x0;
  const idx10 = y0 * width + x1;
  const idx01 = y1 * width + x0;
  const idx11 = y1 * width + x1;

  const top = data[idx00] * (1 - fx) + data[idx10] * fx;
  const bottom = data[idx01] * (1 - fx) + data[idx11] * fx;
  return top * (1 - fy) + bottom * fy;
}

function convertValue(property: SoilProperty, raw: number): number {
  if (!Number.isFinite(raw) || raw <= NODATA_THRESHOLD) {
    return Number.NaN;
  }
  if (property === 'phh2o') {
    return raw / 10;
  }
  if (property === 'sand' || property === 'clay' || property === 'silt') {
    return raw * 10;
  }
  return raw;
}

function resampleProperty(
  dataset: SoilDataset,
  property: SoilProperty,
  source: Float32Array,
  bbox: BoundingBox,
  width: number,
  height: number
): Float32Array {
  const output = new Float32Array(width * height);
  const lonSpan = bbox.maxLon - bbox.minLon;
  const latSpan = bbox.maxLat - bbox.minLat;
  const { minLon, maxLon, minLat, maxLat, pixelWidth, pixelHeight } = dataset;

  for (let y = 0; y < height; y += 1) {
    const lat = clamp(bbox.maxLat - ((y + 0.5) * latSpan) / height, minLat, maxLat);
    const py = (maxLat - lat) / pixelHeight;
    for (let x = 0; x < width; x += 1) {
      const lon = clamp(bbox.minLon + ((x + 0.5) * lonSpan) / width, minLon, maxLon);
      const px = (lon - minLon) / pixelWidth;
      const raw = bilinearSample(source, dataset.width, dataset.height, px, py);
      output[y * width + x] = convertValue(property, raw);
    }
  }

  return output;
}

export class SoilGridsClient {
  private readonly cache = new TimedCache<Record<SoilProperty, Float32Array>>(CACHE_TTL_MS);
  private readonly inFlight = new InFlightMap<Record<SoilProperty, Float32Array>>();
  private datasetPromise: Promise<SoilDataset> | null = null;
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

  async fetchGrid(bbox: BoundingBox, width: number, height: number): Promise<SoilGrid> {
    if (this.useMock) {
      return mockSoilGrid(width, height, bbox);
    }

    const key = this.buildKey(bbox, width, height);
    const cached = this.cache.get(key);
    if (cached) {
      return {
        width,
        height,
        data: cached,
        units: PROPERTY_UNITS
      } satisfies SoilGrid;
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing.promise;
    }

    const controller = new AbortController();
    const promise = this.loadAndResample(bbox, width, height, controller.signal)
      .then((data) => {
        this.cache.set(key, data);
        this.inFlight.delete(key);
        return {
          width,
          height,
          data,
          units: PROPERTY_UNITS
        } satisfies SoilGrid;
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
  ): Promise<Record<SoilProperty, Float32Array>> {
    const dataset = await this.ensureDataset(signal);
    const data: Partial<Record<SoilProperty, Float32Array>> = {};
    (Object.keys(SOIL_PROPERTY_URLS) as SoilProperty[]).forEach((property) => {
      data[property] = resampleProperty(dataset, property, dataset.data[property], bbox, width, height);
    });
    return data as Record<SoilProperty, Float32Array>;
  }

  private async ensureDataset(signal: AbortSignal): Promise<SoilDataset> {
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

  private async loadDataset(signal: AbortSignal): Promise<SoilDataset> {
    const entries = await Promise.all(
      (Object.keys(SOIL_PROPERTY_URLS) as SoilProperty[]).map(async (property) => {
        const url = SOIL_PROPERTY_URLS[property];
        const bundled = usesBundledAsset(url);
        const hint = bundled ? ` ${missingTileHint(property)}` : '';
        let response: Response;

        try {
          response = await fetch(url, { signal });
        } catch (error) {
          if (isAbortError(error)) {
            throw error;
          }
          throw new Error(
            appendHint(
              `Failed to download SoilGrids layer "${property}": ${describeError(error)}`,
              hint
            )
          );
        }

        if (!response.ok) {
          throw new Error(
            appendHint(`Failed to download SoilGrids layer "${property}" (${response.status})`, hint)
          );
        }

        const arrayBuffer = await response.arrayBuffer();

        try {
          ensureGeoTiffResponse({
            source: `SoilGrids ${property}`,
            response,
            buffer: arrayBuffer
          });
        } catch (error) {
          throw new Error(appendHint(describeError(error), hint));
        }

        try {
          const tiff = await wrapGeoTiffDecode({
            source: `SoilGrids ${property}`,
            fn: () => fromArrayBuffer(arrayBuffer)
          });
          const image = await wrapGeoTiffDecode({
            source: `SoilGrids ${property}`,
            fn: () => tiff.getImage()
          });
          const raster = (await wrapGeoTiffDecode({
            source: `SoilGrids ${property}`,
            fn: () => image.readRasters({ interleave: true })
          })) as
            | Float32Array
            | Int16Array
            | Uint16Array
            | Uint8Array;
          const values =
            raster instanceof Float32Array ? raster : Float32Array.from(raster as ArrayLike<number>);
          return {
            property,
            values,
            width: image.getWidth(),
            height: image.getHeight(),
            bbox: image.getBoundingBox()
          } as const;
        } catch (error) {
          if (isAbortError(error)) {
            throw error;
          }
          throw new Error(appendHint(describeError(error), hint));
        }
      })
    );

    if (entries.length === 0) {
      throw new Error('No SoilGrids rasters were loaded.');
    }

    const reference = entries[0];
    const [minLon, minLat, maxLon, maxLat] = reference.bbox;

    for (const entry of entries) {
      if (entry.width !== reference.width || entry.height !== reference.height) {
        throw new Error('SoilGrids rasters have mismatched dimensions.');
      }
    }

    const dataset: SoilDataset = {
      width: reference.width,
      height: reference.height,
      minLon,
      maxLon,
      minLat,
      maxLat,
      pixelWidth: (maxLon - minLon) / reference.width,
      pixelHeight: (maxLat - minLat) / reference.height,
      data: entries.reduce((acc, entry) => {
        acc[entry.property] = entry.values;
        return acc;
      }, {} as Record<SoilProperty, Float32Array>)
    };

    // Sanity-check the extent to catch typos in overrides.
    const extentMatches =
      Math.abs(dataset.minLon - SOIL_DATA_EXTENT.minLon) < 0.5 &&
      Math.abs(dataset.maxLon - SOIL_DATA_EXTENT.maxLon) < 0.5 &&
      Math.abs(dataset.minLat - SOIL_DATA_EXTENT.minLat) < 0.5 &&
      Math.abs(dataset.maxLat - SOIL_DATA_EXTENT.maxLat) < 0.5;
    if (!extentMatches) {
      console.warn('Loaded SoilGrids sample extent differs from expected configuration.', {
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
  }
}
