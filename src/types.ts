import type { BoundingBox } from './config';

export type SoilProperty =
  | 'orcdrc'
  | 'phh2o'
  | 'bdod'
  | 'sand'
  | 'clay'
  | 'silt';

export interface SoilGrid {
  width: number;
  height: number;
  data: Record<SoilProperty, Float32Array>;
  /** Unit metadata to aid conversion */
  units: Record<SoilProperty, string>;
}

export interface LandCoverGrid {
  width: number;
  height: number;
  codes: Uint8Array;
}

export interface SuitabilityResult {
  width: number;
  height: number;
  scores: Float32Array;
  categories: Uint8Array;
  /** Number of cells sampled */
  sampleCount: number;
  /** Average score of sampled cells */
  averageScore: number;
  countsByCategory: {
    ideal: number;
    caution: number;
    poor: number;
  };
}

export interface SuitabilityWorkerInput {
  soil: SoilGrid;
  landCover: LandCoverGrid;
  bbox: BoundingBox;
  requestId: number;
  config: {
    includeWeather: boolean;
  };
}

export interface SuitabilityWorkerOutput extends SuitabilityResult {
  bbox: BoundingBox;
  requestId: number;
}
