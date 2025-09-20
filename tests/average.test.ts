import { describe, expect, it } from 'vitest';
import { RunningAverage } from '../src/scoring/average';

describe('RunningAverage', () => {
  it('computes a streaming mean', () => {
    const avg = new RunningAverage();
    avg.add(10);
    avg.add(20);
    avg.add(30);
    expect(avg.count).toBe(3);
    expect(avg.average).toBe(20);
  });

  it('ignores invalid samples', () => {
    const avg = new RunningAverage();
    avg.add(NaN);
    avg.add(40);
    expect(avg.count).toBe(1);
    expect(avg.average).toBe(40);
  });
});
