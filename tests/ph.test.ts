import { describe, expect, it } from 'vitest';
import { scorePh } from '../src/scoring/ph';

describe('scorePh', () => {
  it('peaks near neutral acidic sweet spot', () => {
    expect(scorePh(6)).toBeGreaterThan(95);
  });

  it('penalises strong acidity and alkalinity', () => {
    expect(scorePh(4)).toBeLessThan(25);
    expect(scorePh(7.5)).toBeLessThan(40);
  });

  it('handles non-numeric input gracefully', () => {
    expect(scorePh(Number.NaN)).toBe(0);
  });
});
