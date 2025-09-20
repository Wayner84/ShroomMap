export function scorePh(ph: number): number {
  if (!Number.isFinite(ph)) {
    return 0;
  }
  const mu = 6.0;
  const sigma = 0.6;
  const exponent = -0.5 * ((ph - mu) / sigma) ** 2;
  const score = Math.exp(exponent) * 100;
  return Math.max(0, Math.min(100, score));
}
