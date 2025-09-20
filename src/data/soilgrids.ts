import { fromArrayBuffer } from 'geotiff';
import {
  DEFAULT_DEPTH,
  MAX_RETRY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  SOILGRIDS_WCS_BASE,
  USE_MOCK_DATA,
  type BoundingBox
} from '../config';
import { InFlightMap, TimedCache } from './cache';
import type { SoilGrid, SoilProperty } from '../types';
import { mockSoilGrid } from './mock/soilgrids';
import { ensureGeoTiffResponse, wrapGeoTiffDecode } from '../utils/geotiff';

const COVERAGE_IDS: Record<SoilProperty, string> = {
  orcdrc: `orcdrc_${DEFAULT_DEPTH}_mean`,
  phh2o: `phh2o_${DEFAULT_DEPTH}_mean`,
  bdod: `bdod_${DEFAULT_DEPTH}_mean`,
  sand: `sand_${DEFAULT_DEPTH}_mean`,
  clay: `clay_${DEFAULT_DEPTH}_mean`,
  silt: `silt_${DEFAULT_DEPTH}_mean`
};

const PROPERTY_UNITS: Record<SoilProperty, string> = {
  orcdrc: 'g/kg',
  phh2o: 'pH',
  bdod: 'kg/m³',
  sand: 'g/kg',
  clay: 'g/kg',
  silt: 'g/kg'
};

const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(url: string, signal: AbortSignal, attempt = 0): Promise<Response> {
  const response = await fetch(url, { signal });
  if (response.ok) {
    return response;
  }
  if (attempt >= MAX_RETRY_ATTEMPTS) {
    throw new Error(`SoilGrids request failed after ${attempt + 1} attempts: ${response.status}`);
  }
  if (response.status === 429 || response.status >= 500) {
    const backoff = RETRY_BASE_DELAY_MS * 2 ** attempt;
    await wait(backoff);
    return fetchWithBackoff(url, signal, attempt + 1);
  }
  throw new Error(`SoilGrids request failed: ${response.status}`);
}

export class SoilGridsClient {
  private readonly cache = new TimedCache<Record<SoilProperty, Float32Array>>(CACHE_TTL_MS);
  private readonly inFlight = new InFlightMap<Record<SoilProperty, Float32Array>>();

  constructor(private readonly useMock = USE_MOCK_DATA) {}

  cancelPending() {
    this.inFlight.cancelAll();
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
      };
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing.promise;
    }

    const controller = new AbortController();
    const promise = this.fetchAllProperties(bbox, width, height, controller.signal)
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
      .catch((err) => {
        this.inFlight.delete(key);
        throw err;
      });

    this.inFlight.set(key, { promise, abort: () => controller.abort() });
    return promise;
  }

  private buildKey(bbox: BoundingBox, width: number, height: number) {
    return [bbox.minLon.toFixed(4), bbox.minLat.toFixed(4), bbox.maxLon.toFixed(4), bbox.maxLat.toFixed(4), width, height].join(':');
  }

  private async fetchAllProperties(
    bbox: BoundingBox,
    width: number,
    height: number,
    signal: AbortSignal
  ): Promise<Record<SoilProperty, Float32Array>> {
    const entries = await Promise.all(
      (Object.keys(COVERAGE_IDS) as SoilProperty[]).map(async (property) => {
        const coverageId = COVERAGE_IDS[property];
        const params = new URLSearchParams({
          SERVICE: 'WCS',
          REQUEST: 'GetCoverage',
          VERSION: '2.0.1',
          COVERAGEID: coverageId,
          FORMAT: 'GEOTIFF_FLOAT32',
          SUBSETTINGCRS: 'EPSG:4326'
        });
        params.append('SUBSET', `Long(${bbox.minLon},${bbox.maxLon})`);
        params.append('SUBSET', `Lat(${bbox.minLat},${bbox.maxLat})`);
        params.append('SCALESIZE', `Long(${width})`);
        params.append('SCALESIZE', `Lat(${height})`);

        const url = `${SOILGRIDS_WCS_BASE}&${params.toString()}`;
        const response = await fetchWithBackoff(url, signal);
        const arrayBuffer = await response.arrayBuffer();
        ensureGeoTiffResponse({
          source: 'SoilGrids',
          response,
          buffer: arrayBuffer,
          coverageId
        });
        const tiff = await wrapGeoTiffDecode({
          source: 'SoilGrids',
          coverageId,
          fn: () => fromArrayBuffer(arrayBuffer)
        });
        const image = await wrapGeoTiffDecode({
          source: 'SoilGrids',
          coverageId,
          fn: () => tiff.getImage()
        });
        const raster = (await wrapGeoTiffDecode({
          source: 'SoilGrids',
          coverageId,
          fn: () => image.readRasters({ interleave: true })
        })) as Float32Array;
        return [property, raster] as const;
      })
    );

    const data = Object.fromEntries(entries) as Record<SoilProperty, Float32Array>;
    return data;
  }
}
