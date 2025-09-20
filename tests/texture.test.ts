import { describe, expect, it } from 'vitest';
import { scoreTexture } from '../src/scoring/texture';

describe('scoreTexture', () => {
  it('favours loamy mixes', () => {
    expect(scoreTexture(450, 250, 300)).toBeGreaterThan(75);
  });

  it('penalises overly sandy soils', () => {
    expect(scoreTexture(900, 50, 50)).toBeLessThan(35);
  });

  it('penalises heavy clays', () => {
    expect(scoreTexture(150, 500, 350)).toBeLessThan(40);
  });
});
