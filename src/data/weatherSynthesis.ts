import type { BoundingBox } from '../config';
import type { WeatherGrid } from '../types';

export interface WeatherSynthesisOptions {
  seed?: number;
  variationScale?: number;
}

const DEFAULT_VARIATION = 0.35;
const MIN_VARIATION = 0.1;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function synthesiseWeatherGrid(
  bbox: BoundingBox,
  width: number,
  height: number,
  basePrecip: number,
  baseTemp: number,
  options: WeatherSynthesisOptions = {}
): WeatherGrid {
  const precipitation = new Float32Array(width * height);
  const temperature = new Float32Array(width * height);

  if (width === 0 || height === 0) {
    return { width, height, precipitation, temperature };
  }

  const safePrecip = Number.isFinite(basePrecip) ? Math.max(0, basePrecip) : 0;
  const safeTemp = Number.isFinite(baseTemp) ? baseTemp : 10;

  const latSpan = bbox.maxLat - bbox.minLat;
  const lonSpan = bbox.maxLon - bbox.minLon;
  const safeLatSpan = Math.abs(latSpan) < 1e-6 ? 1 : latSpan;
  const safeLonSpan = Math.abs(lonSpan) < 1e-6 ? 1 : lonSpan;

  const variation = Math.max(MIN_VARIATION, options.variationScale ?? DEFAULT_VARIATION);
  const seed = options.seed ?? 0;
  const phi = (Math.sin(seed) + 1) * Math.PI;

  const centreLat = (bbox.minLat + bbox.maxLat) / 2;
  const centreLon = (bbox.minLon + bbox.maxLon) / 2;

  for (let y = 0; y < height; y += 1) {
    const v = height === 1 ? 0.5 : y / (height - 1);
    const lat = bbox.maxLat - safeLatSpan * v;
    const latNorm = clamp((lat - bbox.minLat) / safeLatSpan, 0, 1);

    for (let x = 0; x < width; x += 1) {
      const u = width === 1 ? 0.5 : x / (width - 1);
      const lon = bbox.minLon + safeLonSpan * u;
      const lonNorm = clamp((lon - bbox.minLon) / safeLonSpan, 0, 1);
      const idx = y * width + x;

      const waveA = Math.sin((lonNorm * 2 + latNorm) * Math.PI + phi);
      const waveB = Math.cos((latNorm * 1.5 - lonNorm) * Math.PI * 1.2 + phi * 0.5);
      const waveC = Math.sin((lonNorm - latNorm) * Math.PI * 2 + phi * 0.25);
      const composite = (waveA * 0.45 + waveB * 0.35 + waveC * 0.2) * variation;

      const latBias = (0.5 - latNorm) * 0.3;
      const lonBias = (0.5 - lonNorm) * 0.18;

      const precipitationValue = safePrecip * (1 + composite) + safePrecip * (latBias * 0.4 + lonBias * 0.25);
      precipitation[idx] = Math.max(0, precipitationValue);

      const continentality = Math.cos((Math.abs(lon - centreLon) / Math.max(1, Math.abs(safeLonSpan))) * Math.PI) * 2;
      const tempValue = safeTemp + composite * 5 - latBias * 10 + continentality;
      temperature[idx] = tempValue;
    }
  }

  return { width, height, precipitation, temperature };
}
