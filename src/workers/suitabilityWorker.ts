/// <reference lib="webworker" />

import type { SuitabilityWorkerInput, SuitabilityWorkerOutput } from '../types';
import { WeatherOverlay } from '../types';
import { deriveLandCoverClasses, LandClass, WOODLAND_CODE } from '../scoring/landcover';
import { computeSoilScore, mapScoreToCategory, SuitabilityCategory } from '../scoring';
import { RunningAverage } from '../scoring/average';
import { computeWeatherOverlay } from '../scoring/weather';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<SuitabilityWorkerInput>) => {
  const { soil, landCover, weather, bbox, requestId, config } = event.data;
  const weatherGrid = config?.includeWeather && weather ? weather : null;
  const width = Math.min(soil.width, landCover.width, weatherGrid ? weatherGrid.width : soil.width);
  const height = Math.min(soil.height, landCover.height, weatherGrid ? weatherGrid.height : soil.height);
  const codeLength = width * height;
  const codes = landCover.codes.length === codeLength ? landCover.codes : landCover.codes.slice(0, codeLength);
  const landClasses = deriveLandCoverClasses(codes, width, height);
  const woodlandMask = new Uint8Array(width * height);
  const weatherMask = new Uint8Array(width * height);
  const scores = new Float32Array(width * height);
  const categories = new Uint8Array(width * height);
  const average = new RunningAverage();
  const counts = {
    ideal: 0,
    caution: 0,
    poor: 0
  };

  const precipitation = weatherGrid ? weatherGrid.precipitation : null;
  const temperature = weatherGrid ? weatherGrid.temperature : null;
  const weatherLength =
    weatherGrid && precipitation && temperature
      ? Math.min(precipitation.length, temperature.length, width * height)
      : 0;
  const useWeather = !!weatherGrid && !!precipitation && !!temperature && weatherLength > 0;

  for (let idx = 0; idx < width * height; idx += 1) {
    const breakdown = computeSoilScore({
      ph: soil.data.phh2o[idx],
      orcdrc: soil.data.orcdrc[idx],
      bdod: soil.data.bdod[idx],
      sand: soil.data.sand[idx],
      clay: soil.data.clay[idx],
      silt: soil.data.silt[idx]
    });
    const landClass = landClasses[idx] ?? LandClass.Poor;
    let effectiveScore = breakdown.overall;
    let overlay = WeatherOverlay.Neutral;

    if (useWeather && idx < weatherLength) {
      const weatherResult = computeWeatherOverlay({
        baseScore: breakdown.overall,
        precipitation: precipitation![idx],
        temperature: temperature![idx]
      });
      effectiveScore = weatherResult.adjustedScore;
      overlay = weatherResult.overlay;
    }

    const category = mapScoreToCategory(effectiveScore, landClass);

    scores[idx] = effectiveScore;
    categories[idx] = category;
    woodlandMask[idx] = codes[idx] === WOODLAND_CODE ? 1 : 0;
    weatherMask[idx] = overlay;
    average.add(effectiveScore);

    if (category === SuitabilityCategory.Ideal) {
      counts.ideal += 1;
    } else if (category === SuitabilityCategory.Caution) {
      counts.caution += 1;
    } else {
      counts.poor += 1;
    }
  }

  const payload: SuitabilityWorkerOutput = {
    width,
    height,
    scores,
    categories,
    woodlandMask,
    weatherMask,
    averageScore: average.average,
    sampleCount: average.count,
    countsByCategory: counts,
    bbox,
    requestId
  };

  ctx.postMessage(payload, [scores.buffer, categories.buffer, woodlandMask.buffer, weatherMask.buffer]);
};
