import { fromArrayBuffer } from 'geotiff';
import {
  MAX_RETRY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  USE_MOCK_DATA,
  WORLDCOVER_RELEASE,
  WORLDCOVER_WCS_BASE,
  type BoundingBox
} from '../config';
import { InFlightMap, TimedCache } from './cache';
import type { LandCoverGrid } from '../types';
import { mockWorldCover } from './mock/worldcover';
import { ensureGeoTiffResponse, extractGeoTiffBuffer, wrapGeoTiffDecode } from '../utils/geotiff';

const CACHE_TTL_MS = 1000 * 60 * 30;
const COVERAGE_ID = 'urn:cgls:worldcover:v200:2021';

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(url: string, signal: AbortSignal, attempt = 0): Promise<Response> {
  const response = await fetch(url, { signal });
  if (response.ok) {
    return response;
  }
  if (attempt >= MAX_RETRY_ATTEMPTS) {
    throw new Error(`WorldCover request failed after ${attempt + 1} attempts: ${response.status}`);
  }
  if (response.status === 429 || response.status >= 500) {
    const backoff = RETRY_BASE_DELAY_MS * 2 ** attempt;
    await wait(backoff);
    return fetchWithBackoff(url, signal, attempt + 1);
  }
  throw new Error(`WorldCover request failed: ${response.status}`);
}

export class WorldCoverClient {
  private readonly cache = new TimedCache<LandCoverGrid>(CACHE_TTL_MS);
  private readonly inFlight = new InFlightMap<LandCoverGrid>();

  constructor(private readonly useMock = USE_MOCK_DATA) {}

  cancelPending() {
    this.inFlight.cancelAll();
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
    const promise = this.fetchCoverage(bbox, width, height, controller.signal)
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

  private async fetchCoverage(
    bbox: BoundingBox,
    width: number,
    height: number,
    signal: AbortSignal
  ): Promise<LandCoverGrid> {
    const params = new URLSearchParams({
      SERVICE: 'WCS',
      REQUEST: 'GetCoverage',
      VERSION: '2.0.1',
      COVERAGEID: COVERAGE_ID,
      FORMAT: 'GEOTIFF_INT16',
      SUBSETTINGCRS: 'EPSG:4326'
    });
    params.append('SUBSET', `Long(${bbox.minLon},${bbox.maxLon})`);
    params.append('SUBSET', `Lat(${bbox.minLat},${bbox.maxLat})`);
    params.append('SCALESIZE', `Long(${width})`);
    params.append('SCALESIZE', `Lat(${height})`);

    const url = `${WORLDCOVER_WCS_BASE}?${params.toString()}`;
    const response = await fetchWithBackoff(url, signal);
    const responseBuffer = await response.arrayBuffer();
    const arrayBuffer = extractGeoTiffBuffer(responseBuffer);
    ensureGeoTiffResponse({
      source: 'WorldCover',
      response,
      buffer: arrayBuffer,
      coverageId: COVERAGE_ID
    });
    const tiff = await wrapGeoTiffDecode({
      source: 'WorldCover',
      coverageId: COVERAGE_ID,
      fn: () => fromArrayBuffer(arrayBuffer)
    });
    const image = await wrapGeoTiffDecode({
      source: 'WorldCover',
      coverageId: COVERAGE_ID,
      fn: () => tiff.getImage()
    });
    const raster = (await wrapGeoTiffDecode({
      source: 'WorldCover',
      coverageId: COVERAGE_ID,
      fn: () => image.readRasters({ interleave: true })
    })) as Uint16Array | Uint8Array;
    const typed =
      raster instanceof Uint16Array
        ? Uint8Array.from(raster)
        : (raster as Uint8Array);
    return {
      width,
      height,
      codes: typed
    };
  }
}
