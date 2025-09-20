import { describe, expect, it } from 'vitest';
import { deriveLandCoverClasses, LandClass } from '../src/scoring/landcover';

describe('deriveLandCoverClasses', () => {
  it('marks shrub and grass classes as ideal while excluding farmland and water', () => {
    const width = 5;
    const height = 3;
    const codes = new Uint8Array([
      20, 40, 80, 50, 30,
      10, 80, 10, 95, 80,
      60, 90, 20, 60, 10
    ]);
    const classes = deriveLandCoverClasses(codes, width, height);

    expect(classes[0]).toBe(LandClass.Ideal); // shrubland
    expect(classes[1]).toBe(LandClass.Poor); // cropland
    expect(classes[2]).toBe(LandClass.Poor); // water
  });

  it('promotes woodland cells bordering clearings to ideal', () => {
    const width = 4;
    const height = 2;
    const codes = new Uint8Array([
      30, 30, 40, 40,
      10, 80, 80, 50
    ]);
    const classes = deriveLandCoverClasses(codes, width, height);
    expect(classes[4]).toBe(LandClass.Ideal);
  });

  it('keeps isolated woodland cautionary', () => {
    const width = 3;
    const height = 3;
    const codes = new Uint8Array([
      40, 40, 40,
      40, 10, 40,
      40, 40, 40
    ]);
    const classes = deriveLandCoverClasses(codes, width, height);
    expect(classes[4]).toBe(LandClass.Caution);
  });
});
