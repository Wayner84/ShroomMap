/// <reference lib="webworker" />

import type { SuitabilityWorkerInput, SuitabilityWorkerOutput } from '../types';
import { deriveLandCoverClasses, LandClass, WOODLAND_CODE } from '../scoring/landcover';
import { computeSoilScore, mapScoreToCategory, SuitabilityCategory } from '../scoring';
import { RunningAverage } from '../scoring/average';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<SuitabilityWorkerInput>) => {
  const { soil, landCover, bbox, requestId } = event.data;
  const width = Math.min(soil.width, landCover.width);
  const height = Math.min(soil.height, landCover.height);
  const codeLength = width * height;
  const codes = landCover.codes.length === codeLength ? landCover.codes : landCover.codes.slice(0, codeLength);
  const landClasses = deriveLandCoverClasses(codes, width, height);
  const woodlandMask = new Uint8Array(width * height);
  const scores = new Float32Array(width * height);
  const categories = new Uint8Array(width * height);
  const average = new RunningAverage();
  const counts = {
    ideal: 0,
    caution: 0,
    poor: 0
  };

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
    const category = mapScoreToCategory(breakdown.overall, landClass);

    scores[idx] = breakdown.overall;
    categories[idx] = category;
    woodlandMask[idx] = codes[idx] === WOODLAND_CODE ? 1 : 0;
    average.add(breakdown.overall);

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
    averageScore: average.average,
    sampleCount: average.count,
    countsByCategory: counts,
    bbox,
    requestId
  };

  ctx.postMessage(payload, [scores.buffer, categories.buffer, woodlandMask.buffer]);
};
