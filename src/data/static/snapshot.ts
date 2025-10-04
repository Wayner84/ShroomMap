import type { BoundingBox } from '../../config';
import type { LandCoverGrid, SoilGrid, SoilProperty } from '../../types';

const SNAPSHOT_BBOX: BoundingBox = {
  minLon: -9.6,
  minLat: 49.0,
  maxLon: 3.2,
  maxLat: 60.0
};

const SNAPSHOT_WIDTH = 360;
const SNAPSHOT_HEIGHT = 432;

const SOIL_UNITS: Record<SoilProperty, string> = {
  orcdrc: 'g/kg',
  phh2o: 'pH',
  bdod: 'kg/m³',
  sand: 'g/kg',
  clay: 'g/kg',
  silt: 'g/kg'
};

type SoilSnapshot = Record<SoilProperty, Float32Array>;

const soilSnapshot: SoilSnapshot = createSoilSnapshot();
const landCoverSnapshot = createLandCoverSnapshot();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalise(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  return (value - min) / (max - min);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bilinearSample(data: Float32Array, width: number, height: number, u: number, v: number): number {
  if (width === 0 || height === 0) {
    return 0;
  }
  const clampedU = clamp(u, 0, 1);
  const clampedV = clamp(v, 0, 1);

  const x = clampedU * (width - 1);
  const y = clampedV * (height - 1);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);

  const tx = x - x0;
  const ty = y - y0;

  const idx00 = y0 * width + x0;
  const idx10 = y0 * width + x1;
  const idx01 = y1 * width + x0;
  const idx11 = y1 * width + x1;

  const top = lerp(data[idx00], data[idx10], tx);
  const bottom = lerp(data[idx01], data[idx11], tx);
  return lerp(top, bottom, ty);
}

function createSoilSnapshot(): SoilSnapshot {
  const size = SNAPSHOT_WIDTH * SNAPSHOT_HEIGHT;
  const data: SoilSnapshot = {
    orcdrc: new Float32Array(size),
    phh2o: new Float32Array(size),
    bdod: new Float32Array(size),
    sand: new Float32Array(size),
    clay: new Float32Array(size),
    silt: new Float32Array(size)
  };

  for (let y = 0; y < SNAPSHOT_HEIGHT; y += 1) {
    const latNorm = SNAPSHOT_HEIGHT === 1 ? 0.5 : y / (SNAPSHOT_HEIGHT - 1);
    const upland = Math.pow(clamp(latNorm - 0.45, 0, 1), 1.35);

    for (let x = 0; x < SNAPSHOT_WIDTH; x += 1) {
      const lonNorm = SNAPSHOT_WIDTH === 1 ? 0.5 : x / (SNAPSHOT_WIDTH - 1);
      const westness = 1 - lonNorm;
      const idx = y * SNAPSHOT_WIDTH + x;

      const atlanticMoisture = Math.pow(westness, 0.9);
      const rainfall = clamp(0.3 + atlanticMoisture * 0.5 + upland * 0.35, 0.15, 1);
      const dryness = 1 - rainfall;
      const peatiness = clamp(rainfall - 0.65, 0, 1);
      const lowland = Math.pow(clamp(0.55 - upland * 1.6, 0, 1), 1.2);
      const ripple = Math.sin((latNorm * 2.4 + lonNorm * 1.1) * Math.PI) * 0.08 +
        Math.cos((lonNorm * 1.7 - latNorm * 1.3) * Math.PI * 0.75) * 0.05;

      const organicCarbon = clamp(32 + rainfall * 65 + upland * 38 + peatiness * 55 + ripple * 10, 18, 185);
      const phValue = clamp(4.15 + dryness * 1.8 + lonNorm * 0.85 - upland * 0.65 + ripple * 0.35, 3.9, 6.9);
      const bulkDensity = clamp(930 + dryness * 180 - peatiness * 220 + lowland * 90 + ripple * 40, 820, 1350);

      let sand = clamp(320 + lonNorm * 360 - rainfall * 210 - upland * 80 + ripple * 70, 120, 820);
      let clay = clamp(240 + rainfall * 230 + upland * 160 - lonNorm * 110 + ripple * -40, 90, 610);
      let silt = Math.max(120, 1000 - sand - clay);

      if (sand + clay + silt !== 1000) {
        const total = sand + clay + silt;
        const scale = 1000 / total;
        sand *= scale;
        clay *= scale;
        silt *= scale;
      }

      data.orcdrc[idx] = organicCarbon;
      data.phh2o[idx] = phValue;
      data.bdod[idx] = bulkDensity;
      data.sand[idx] = sand;
      data.clay[idx] = clay;
      data.silt[idx] = silt;
    }
  }

  return data;
}

function gaussianFalloff(x: number, y: number, cx: number, cy: number, radius: number): number {
  const dx = x - cx;
  const dy = y - cy;
  const distanceSq = dx * dx + dy * dy;
  const sigma = radius * radius * 0.5;
  if (sigma === 0) {
    return 0;
  }
  return Math.exp(-distanceSq / (2 * sigma));
}

function createLandCoverSnapshot(): Uint8Array {
  const size = SNAPSHOT_WIDTH * SNAPSHOT_HEIGHT;
  const codes = new Uint8Array(size);

  for (let y = 0; y < SNAPSHOT_HEIGHT; y += 1) {
    const latNorm = SNAPSHOT_HEIGHT === 1 ? 0.5 : y / (SNAPSHOT_HEIGHT - 1);
    const upland = Math.pow(clamp(latNorm - 0.5, 0, 1), 1.4);

    for (let x = 0; x < SNAPSHOT_WIDTH; x += 1) {
      const lonNorm = SNAPSHOT_WIDTH === 1 ? 0.5 : x / (SNAPSHOT_WIDTH - 1);
      const westness = 1 - lonNorm;
      const idx = y * SNAPSHOT_WIDTH + x;

      const atlanticMoisture = Math.pow(westness, 0.9);
      const rainfall = clamp(0.35 + atlanticMoisture * 0.45 + upland * 0.3, 0.15, 1);
      const dryness = 1 - rainfall;
      const coastal = lonNorm < 0.03 || lonNorm > 0.97 || latNorm < 0.03 || latNorm > 0.97;

      const lochPattern = Math.pow(
        Math.sin((latNorm * 4.3 - lonNorm * 2.1) * Math.PI) * 0.6 +
          Math.cos((latNorm * 3.1 + lonNorm * 5.7) * Math.PI) * 0.4,
        4
      );
      const waterScore = coastal ? 0.85 : Math.max(0, lochPattern - 0.35);

      const london = gaussianFalloff(lonNorm, latNorm, 0.73, 0.37, 0.006);
      const birmingham = gaussianFalloff(lonNorm, latNorm, 0.63, 0.41, 0.0045);
      const manchester = gaussianFalloff(lonNorm, latNorm, 0.55, 0.48, 0.004);
      const glasgow = gaussianFalloff(lonNorm, latNorm, 0.47, 0.6, 0.0035);
      const urbanScore = london * 1.6 + birmingham + manchester + glasgow;

      const eastAnglia = gaussianFalloff(lonNorm, latNorm, 0.82, 0.42, 0.008);
      const fens = gaussianFalloff(lonNorm, latNorm, 0.78, 0.45, 0.006);
      const cambs = gaussianFalloff(lonNorm, latNorm, 0.76, 0.43, 0.005);
      const croplandScore = dryness * 0.5 + eastAnglia * 1.3 + fens * 0.8 + cambs;

      const moorlandScore = upland * 1.2 + rainfall * 0.4 + Math.pow(dryness, 2) * 0.3;
      const woodlandScore = rainfall * 0.8 + (1 - dryness) * 0.2 + westness * 0.3;

      if (waterScore > 0.82) {
        codes[idx] = 80; // Water bodies
        continue;
      }

      if (urbanScore > 0.65) {
        codes[idx] = 50; // Built-up
        continue;
      }

      if (croplandScore > 0.75 && dryness > 0.35) {
        codes[idx] = 40; // Cropland
        continue;
      }

      if (moorlandScore > 0.72) {
        codes[idx] = 30; // Grassland / moor
        continue;
      }

      if (woodlandScore > 0.6) {
        codes[idx] = 10; // Tree cover
        continue;
      }

      if (dryness > 0.6) {
        codes[idx] = 90; // Moss & lichen / sparse vegetation
        continue;
      }

      codes[idx] = 20; // Shrubland / transitional areas
    }
  }

  return codes;
}

function intersectsSnapshot(bbox: BoundingBox): boolean {
  return !(
    bbox.maxLon < SNAPSHOT_BBOX.minLon ||
    bbox.minLon > SNAPSHOT_BBOX.maxLon ||
    bbox.maxLat < SNAPSHOT_BBOX.minLat ||
    bbox.minLat > SNAPSHOT_BBOX.maxLat
  );
}

function toSnapshotCoords(value: number, min: number, max: number): number {
  const normalised = normalise(value, min, max);
  return clamp(normalised, 0, 1);
}

export function sampleStaticSoilGrid(bbox: BoundingBox, width: number, height: number): SoilGrid | null {
  if (!intersectsSnapshot(bbox)) {
    return null;
  }

  const result: SoilGrid = {
    width,
    height,
    units: { ...SOIL_UNITS },
    data: {
      orcdrc: new Float32Array(width * height),
      phh2o: new Float32Array(width * height),
      bdod: new Float32Array(width * height),
      sand: new Float32Array(width * height),
      clay: new Float32Array(width * height),
      silt: new Float32Array(width * height)
    }
  };

  if (width === 0 || height === 0) {
    return result;
  }

  for (let y = 0; y < height; y += 1) {
    const lat = height === 1 ? (bbox.minLat + bbox.maxLat) / 2 : lerp(bbox.maxLat, bbox.minLat, y / (height - 1));
    const v = toSnapshotCoords(lat, SNAPSHOT_BBOX.minLat, SNAPSHOT_BBOX.maxLat);

    for (let x = 0; x < width; x += 1) {
      const lon = width === 1 ? (bbox.minLon + bbox.maxLon) / 2 : lerp(bbox.minLon, bbox.maxLon, x / (width - 1));
      const u = toSnapshotCoords(lon, SNAPSHOT_BBOX.minLon, SNAPSHOT_BBOX.maxLon);
      const idx = y * width + x;

      result.data.orcdrc[idx] = bilinearSample(soilSnapshot.orcdrc, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT, u, v);
      result.data.phh2o[idx] = bilinearSample(soilSnapshot.phh2o, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT, u, v);
      result.data.bdod[idx] = bilinearSample(soilSnapshot.bdod, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT, u, v);
      result.data.sand[idx] = bilinearSample(soilSnapshot.sand, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT, u, v);
      result.data.clay[idx] = bilinearSample(soilSnapshot.clay, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT, u, v);
      result.data.silt[idx] = bilinearSample(soilSnapshot.silt, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT, u, v);
    }
  }

  return result;
}

export function sampleStaticLandCover(bbox: BoundingBox, width: number, height: number): LandCoverGrid | null {
  if (!intersectsSnapshot(bbox)) {
    return null;
  }

  const result: LandCoverGrid = {
    width,
    height,
    codes: new Uint8Array(width * height)
  };

  if (width === 0 || height === 0) {
    return result;
  }

  for (let y = 0; y < height; y += 1) {
    const lat = height === 1 ? (bbox.minLat + bbox.maxLat) / 2 : lerp(bbox.maxLat, bbox.minLat, y / (height - 1));
    const v = toSnapshotCoords(lat, SNAPSHOT_BBOX.minLat, SNAPSHOT_BBOX.maxLat);

    for (let x = 0; x < width; x += 1) {
      const lon = width === 1 ? (bbox.minLon + bbox.maxLon) / 2 : lerp(bbox.minLon, bbox.maxLon, x / (width - 1));
      const u = toSnapshotCoords(lon, SNAPSHOT_BBOX.minLon, SNAPSHOT_BBOX.maxLon);

      const sampleX = Math.round(u * (SNAPSHOT_WIDTH - 1));
      const sampleY = Math.round(v * (SNAPSHOT_HEIGHT - 1));
      const snapshotIdx = sampleY * SNAPSHOT_WIDTH + sampleX;
      const idx = y * width + x;

      result.codes[idx] = landCoverSnapshot[snapshotIdx];
    }
  }

  return result;
}

export function describeSnapshotCoverage(): string {
  const lonSpan = SNAPSHOT_BBOX.maxLon - SNAPSHOT_BBOX.minLon;
  const latSpan = SNAPSHOT_BBOX.maxLat - SNAPSHOT_BBOX.minLat;
  return `${lonSpan.toFixed(1)}°×${latSpan.toFixed(1)}° UK snapshot`;
}
