import { describe, expect, it } from 'vitest';

import { computeWeatherOverlay } from '../src/scoring/weather';
import { WeatherOverlay } from '../src/types';

describe('computeWeatherOverlay', () => {
  it('boosts scores when rainfall and temperature are favourable', () => {
    const result = computeWeatherOverlay({ baseScore: 55, precipitation: 5.1, temperature: 12 });
    expect(result.overlay).toBe(WeatherOverlay.Favourable);
    expect(result.adjustedScore).toBeGreaterThan(60);
  });

  it('penalises dry conditions', () => {
    const result = computeWeatherOverlay({ baseScore: 72, precipitation: 0.25, temperature: 17 });
    expect(result.overlay).toBe(WeatherOverlay.Dry);
    expect(result.adjustedScore).toBeLessThan(60);
  });

  it('remains neutral around moderate conditions', () => {
    const result = computeWeatherOverlay({ baseScore: 48, precipitation: 2.6, temperature: 10.5 });
    expect(result.overlay).toBe(WeatherOverlay.Neutral);
    expect(Math.abs(result.adjustedScore - 48)).toBeLessThan(6);
  });
});
