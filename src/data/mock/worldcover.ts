import type { BoundingBox } from '../../config';
import type { LandCoverGrid } from '../../types';

const IDEAL_CODES = [20, 30, 100];
const EDGE_CODES = [10];
const POOR_CODES = [40, 50, 60, 80];

function classify(lat: number, lon: number): number {
  if (lat > 55.5) {
    return 100;
  }
  if (lon < -4 && lat < 54) {
    return 20;
  }
  if (lat > 51 && lat < 55 && lon > -3 && lon < 1) {
    return 30;
  }
  if ((lat > 53 && lon > -2) || (lat < 51)) {
    return 40;
  }
  return EDGE_CODES[0];
}

export function mockWorldCover(width: number, height: number, bbox: BoundingBox): LandCoverGrid {
  const codes = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const lat = bbox.minLat + ((bbox.maxLat - bbox.minLat) * y) / (height - 1);
      const lon = bbox.minLon + ((bbox.maxLon - bbox.minLon) * x) / (width - 1);
      let code = classify(lat, lon);
      if (EDGE_CODES.includes(code)) {
        // Add some alternating structure to simulate edges
        const parity = (Math.floor(lat * 10) + Math.floor(lon * 10)) % 2;
        code = parity === 0 ? IDEAL_CODES[0] : code;
      }
      if (POOR_CODES.includes(code) && Math.random() > 0.8) {
        code = IDEAL_CODES[1];
      }
      codes[y * width + x] = code;
    }
  }
  return {
    width,
    height,
    codes
  };
}
