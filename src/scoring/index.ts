import { scoreMoistureProxy } from './moisture';
import { scoreOrganicCarbon } from './organicCarbon';
import { scorePh } from './ph';
import { LandClass } from './landcover';
import { scoreTexture } from './texture';

export const enum SuitabilityCategory {
  Poor = 0,
  Caution = 1,
  Ideal = 2
}

export interface SoilInputs {
  ph: number;
  orcdrc: number;
  bdod: number;
  sand: number;
  clay: number;
  silt: number;
}

export interface SoilScoreBreakdown {
  ph: number;
  organic: number;
  texture: number;
  moisture: number;
  overall: number;
}

const COMPONENT_WEIGHTS = {
  ph: 0.32,
  organic: 0.22,
  texture: 0.28,
  moisture: 0.18
} as const;

function weightedAverage(entries: Array<{ score: number; weight: number }>): number {
  let weightSum = 0;
  let total = 0;
  for (const entry of entries) {
    if (Number.isFinite(entry.score)) {
      total += entry.score * entry.weight;
      weightSum += entry.weight;
    }
  }
  if (weightSum === 0) {
    return 0;
  }
  return total / weightSum;
}

export function computeSoilScore(inputs: SoilInputs): SoilScoreBreakdown {
  const phScore = scorePh(inputs.ph);
  const organicScore = scoreOrganicCarbon(inputs.orcdrc);
  const textureScore = scoreTexture(inputs.sand, inputs.clay, inputs.silt);
  const moistureScore = scoreMoistureProxy(inputs.bdod);

  const overall = weightedAverage([
    { score: phScore, weight: COMPONENT_WEIGHTS.ph },
    { score: organicScore, weight: COMPONENT_WEIGHTS.organic },
    { score: textureScore, weight: COMPONENT_WEIGHTS.texture },
    { score: moistureScore, weight: COMPONENT_WEIGHTS.moisture }
  ]);

  return {
    ph: phScore,
    organic: organicScore,
    texture: textureScore,
    moisture: moistureScore,
    overall: Math.max(0, Math.min(100, overall))
  };
}

export function mapScoreToCategory(score: number, landClass: LandClass): SuitabilityCategory {
  if (!Number.isFinite(score)) {
    return SuitabilityCategory.Poor;
  }
  if (landClass === LandClass.Poor) {
    return SuitabilityCategory.Poor;
  }
  const adjusted = landClass === LandClass.Caution ? score - 10 : score;
  if (adjusted >= 70) {
    return landClass === LandClass.Caution ? SuitabilityCategory.Caution : SuitabilityCategory.Ideal;
  }
  if (adjusted >= 45) {
    return SuitabilityCategory.Caution;
  }
  return SuitabilityCategory.Poor;
}
