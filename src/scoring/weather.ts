import { WeatherOverlay } from '../types';

export interface WeatherOverlayInput {
  baseScore: number;
  precipitation: number;
  temperature: number;
}

export interface WeatherOverlayResult {
  adjustedScore: number;
  overlay: WeatherOverlay;
}

const PRECIP_MIN_MM = 0.2;
const PRECIP_IDEAL_MM = 4.2;
const PRECIP_MAX_MM = 10;
const PRECIP_FAVOURABLE_THRESHOLD = 4;
const PRECIP_DRY_THRESHOLD = 0.8;

const TEMP_MIN_C = 3;
const TEMP_IDEAL_C = 12;
const TEMP_MAX_C = 19;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function triangularScore(value: number, min: number, peak: number, max: number) {
  if (!Number.isFinite(value) || max <= min || peak <= min || peak >= max) {
    return 0;
  }
  if (value <= min || value >= max) {
    return 0;
  }
  if (value === peak) {
    return 1;
  }
  if (value < peak) {
    return (value - min) / (peak - min);
  }
  return (max - value) / (max - peak);
}

function adjustForExtremes(precipitation: number, temperature: number, combinedScore: number) {
  let modifier = 0;
  let adjustedCombined = combinedScore;

  if (precipitation < PRECIP_DRY_THRESHOLD) {
    modifier -= clamp((PRECIP_DRY_THRESHOLD - precipitation) * 8, 0, 12);
    adjustedCombined = Math.min(adjustedCombined, 0.3);
  }

  if (precipitation > PRECIP_MAX_MM) {
    modifier -= clamp((precipitation - PRECIP_MAX_MM) * 2, 0, 6);
  }

  if (temperature < TEMP_MIN_C) {
    modifier -= clamp((TEMP_MIN_C - temperature) * 1.8, 0, 10);
    adjustedCombined = Math.min(adjustedCombined, 0.35);
  }

  if (temperature > 22) {
    modifier -= clamp((temperature - 22) * 1.2, 0, 10);
    adjustedCombined = Math.min(adjustedCombined, 0.4);
  }

  if (precipitation > PRECIP_FAVOURABLE_THRESHOLD && temperature >= 8 && temperature <= 16) {
    modifier += 6;
    adjustedCombined = Math.max(adjustedCombined, 0.7);
  }

  return { modifier, adjustedCombined };
}

export function computeWeatherOverlay({
  baseScore,
  precipitation,
  temperature
}: WeatherOverlayInput): WeatherOverlayResult {
  const safeBase = Number.isFinite(baseScore) ? baseScore : 0;

  if (!Number.isFinite(precipitation) || !Number.isFinite(temperature)) {
    return { adjustedScore: clamp(safeBase, 0, 100), overlay: WeatherOverlay.Neutral };
  }

  const precipitationScore = triangularScore(precipitation, PRECIP_MIN_MM, PRECIP_IDEAL_MM, PRECIP_MAX_MM);
  const temperatureScore = triangularScore(temperature, TEMP_MIN_C, TEMP_IDEAL_C, TEMP_MAX_C);

  const combinedBase = precipitationScore * 0.65 + temperatureScore * 0.35;
  const { modifier: extremeModifier, adjustedCombined } = adjustForExtremes(
    precipitation,
    temperature,
    combinedBase
  );

  const combinedScore = clamp(adjustedCombined, 0, 1);
  const combinedModifier = (combinedScore - 0.5) * 26;

  const adjustedScore = clamp(safeBase + combinedModifier + extremeModifier, 0, 100);

  let overlay = WeatherOverlay.Neutral;
  if (precipitation <= PRECIP_DRY_THRESHOLD || combinedScore < 0.32) {
    overlay = WeatherOverlay.Dry;
  } else if (precipitation >= PRECIP_FAVOURABLE_THRESHOLD && combinedScore >= 0.65 && temperatureScore > 0.45) {
    overlay = WeatherOverlay.Favourable;
  }

  return { adjustedScore, overlay };
}
