import type { BoundingBox } from '../../config';
import type { WeatherGrid } from '../../types';
import { synthesiseWeatherGrid } from '../weatherSynthesis';

export function mockWeather(width: number, height: number, bbox: BoundingBox): WeatherGrid {
  const centreLat = (bbox.minLat + bbox.maxLat) / 2;
  const centreLon = (bbox.minLon + bbox.maxLon) / 2;

  const basePrecip =
    3.2 + Math.sin((centreLat + 48) * 0.18) * 1.6 - Math.cos((centreLon + 2) * 0.16) * 0.9;
  const baseTemp =
    10.5 - Math.sin((centreLat - 50) * 0.2) * 3 + Math.cos((centreLon + 1) * 0.15) * 1.4;

  const seed = Math.round((centreLat + centreLon) * 100) % 360;

  return synthesiseWeatherGrid(bbox, width, height, Math.max(0.4, basePrecip), baseTemp, {
    seed,
    variationScale: 0.45
  });
}
