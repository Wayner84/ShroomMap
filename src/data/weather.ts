import {
  ENABLE_WEATHER_OVERLAY,
  USE_MOCK_DATA,
  WEATHER_API_BASE,
  type BoundingBox
} from '../config';
import { InFlightMap, TimedCache } from './cache';
import type { WeatherGrid } from '../types';
import { mockWeather } from './mock/weather';
import { synthesiseWeatherGrid } from './weatherSynthesis';

const CACHE_TTL_MS = 1000 * 60 * 30;
const DEFAULT_PRECIP_MM = 2.8;
const DEFAULT_TEMP_C = 11;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function takeLast(values: number[], count: number) {
  if (count <= 0) {
    return [] as number[];
  }
  return values.slice(-count);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return sum(values) / values.length;
}

interface WeatherSummary {
  basePrecip: number;
  baseTemp: number;
}

export class WeatherClient {
  private readonly cache = new TimedCache<WeatherGrid>(CACHE_TTL_MS);
  private readonly inFlight = new InFlightMap<WeatherGrid>();

  constructor(
    private readonly useMock = USE_MOCK_DATA,
    private readonly apiBase = WEATHER_API_BASE
  ) {}

  cancelPending() {
    this.inFlight.cancelAll();
  }

  async fetchGrid(bbox: BoundingBox, width: number, height: number): Promise<WeatherGrid> {
    if (!ENABLE_WEATHER_OVERLAY) {
      return mockWeather(width, height, bbox);
    }

    if (this.useMock) {
      return mockWeather(width, height, bbox);
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
    const promise = this.fetchWeather(bbox, width, height, controller.signal)
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
    return [bbox.minLon.toFixed(4), bbox.minLat.toFixed(4), bbox.maxLon.toFixed(4), bbox.maxLat.toFixed(4), width, height].join(
      ':'
    );
  }

  private async fetchWeather(
    bbox: BoundingBox,
    width: number,
    height: number,
    signal: AbortSignal
  ): Promise<WeatherGrid> {
    try {
      const summary = await this.fetchWeatherSummary(bbox, signal);
      const seed = Math.round((summary.basePrecip + summary.baseTemp) * 1000);
      return synthesiseWeatherGrid(bbox, width, height, summary.basePrecip, summary.baseTemp, {
        seed,
        variationScale: 0.38
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      if (import.meta.env.DEV) {
        console.warn('Falling back to synthetic weather data', error);
      }
      return mockWeather(width, height, bbox);
    }
  }

  private async fetchWeatherSummary(bbox: BoundingBox, signal: AbortSignal): Promise<WeatherSummary> {
    if (!this.apiBase) {
      return { basePrecip: DEFAULT_PRECIP_MM, baseTemp: DEFAULT_TEMP_C };
    }

    const centreLat = (bbox.minLat + bbox.maxLat) / 2;
    const centreLon = (bbox.minLon + bbox.maxLon) / 2;
    const url = new URL(this.apiBase);
    url.searchParams.set('latitude', centreLat.toFixed(3));
    url.searchParams.set('longitude', centreLon.toFixed(3));
    url.searchParams.set('hourly', 'temperature_2m,precipitation');
    url.searchParams.set('past_days', '1');
    url.searchParams.set('forecast_days', '1');
    url.searchParams.set('timezone', 'UTC');

    const response = await fetch(url.toString(), { signal });
    if (!response.ok) {
      throw new Error(`Weather request failed: ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid weather response payload');
    }

    const hourlyRaw = (payload as { hourly?: Record<string, unknown> }).hourly;
    if (!hourlyRaw || typeof hourlyRaw !== 'object') {
      throw new Error('Weather payload missing hourly data');
    }

    const precipitationRaw = Array.isArray(hourlyRaw.precipitation) ? hourlyRaw.precipitation : [];
    const temperatureRaw = Array.isArray(hourlyRaw.temperature_2m) ? hourlyRaw.temperature_2m : [];

    const precipitationValues = precipitationRaw.filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value)
    );
    const temperatureValues = temperatureRaw.filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value)
    );

    const precipitationSlice = takeLast(precipitationValues, 24);
    const precipitationLastDay = precipitationSlice.length > 0 ? sum(precipitationSlice) : DEFAULT_PRECIP_MM;

    const temperatureSlice = takeLast(temperatureValues, 24);
    const temperatureAverage = average(temperatureSlice) ?? DEFAULT_TEMP_C;

    return {
      basePrecip: clamp(precipitationLastDay, 0, 12),
      baseTemp: clamp(temperatureAverage, -5, 23)
    };
  }
}
