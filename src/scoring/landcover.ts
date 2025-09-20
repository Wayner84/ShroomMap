export const enum LandClass {
  Poor = 0,
  Caution = 1,
  Ideal = 2
}

const IDEAL_CODES = new Set([20, 30, 100]);
const CAUTION_CODES = new Set([90, 95]);
const AVOID_CODES = new Set([40, 50, 60, 70, 80]);
const WOODLAND_CODE = 10;

export function deriveLandCoverClasses(codes: Uint8Array, width: number, height: number): Uint8Array {
  const classes = new Uint8Array(width * height);

  for (let idx = 0; idx < codes.length; idx += 1) {
    const code = codes[idx];
    if (IDEAL_CODES.has(code)) {
      classes[idx] = LandClass.Ideal;
    } else if (AVOID_CODES.has(code)) {
      classes[idx] = LandClass.Poor;
    } else if (code === WOODLAND_CODE) {
      classes[idx] = LandClass.Caution;
    } else if (CAUTION_CODES.has(code)) {
      classes[idx] = LandClass.Caution;
    } else {
      classes[idx] = LandClass.Caution;
    }
  }

  // Promote woodland edges that neighbour ideal clearings.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (codes[idx] !== WOODLAND_CODE) {
        continue;
      }
      let neighbourIdeal = false;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1) && !neighbourIdeal; ny += 1) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx += 1) {
          if (nx === x && ny === y) {
            continue;
          }
          const nIdx = ny * width + nx;
          if (classes[nIdx] === LandClass.Ideal) {
            neighbourIdeal = true;
            break;
          }
        }
      }
      if (neighbourIdeal) {
        classes[idx] = LandClass.Ideal;
      }
    }
  }

  return classes;
}
