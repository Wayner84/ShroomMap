import type { BoundingBox } from '../../config';
import type { SoilGrid, SoilProperty } from '../../types';

const MOCK_UNITS: Record<SoilProperty, string> = {
  orcdrc: 'g/kg',
  phh2o: 'pH',
  bdod: 'kg/m³',
  sand: 'g/kg',
  clay: 'g/kg',
  silt: 'g/kg'
};

function seededRandom(x: number, y: number) {
  const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return seed - Math.floor(seed);
}

export function mockSoilGrid(width: number, height: number, bbox: BoundingBox): SoilGrid {
  const data: Record<SoilProperty, Float32Array> = {
    orcdrc: new Float32Array(width * height),
    phh2o: new Float32Array(width * height),
    bdod: new Float32Array(width * height),
    sand: new Float32Array(width * height),
    clay: new Float32Array(width * height),
    silt: new Float32Array(width * height)
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const lat = bbox.minLat + ((bbox.maxLat - bbox.minLat) * y) / (height - 1);
      const lon = bbox.minLon + ((bbox.maxLon - bbox.minLon) * x) / (width - 1);
      const noise = seededRandom(lat, lon);
      data.phh2o[idx] = 5.2 + noise * 2.0;
      data.orcdrc[idx] = 30 + noise * 70; // g/kg -> ~3-10%
      data.bdod[idx] = 1100 + noise * 300;
      data.sand[idx] = 400 + noise * 300;
      data.clay[idx] = 200 + noise * 150;
      data.silt[idx] = 400 - noise * 150;
    }
  }

  return {
    width,
    height,
    data,
    units: { ...MOCK_UNITS }
  };
}
