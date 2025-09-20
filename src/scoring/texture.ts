export function scoreTexture(sand: number, clay: number, silt: number): number {
  if (![sand, clay, silt].every((value) => Number.isFinite(value) && value >= 0)) {
    return 0;
  }
  const sandPct = sand / 10;
  const clayPct = clay / 10;
  const siltPct = silt / 10;
  const total = sandPct + clayPct + siltPct;
  if (total <= 0) {
    return 0;
  }
  const sandRatio = (sandPct / total) * 100;
  const clayRatio = (clayPct / total) * 100;
  const siltRatio = (siltPct / total) * 100;

  let score = 100;
  const sandDistance = Math.max(0, Math.abs(sandRatio - 45) - 10);
  const clayDistance = Math.max(0, Math.abs(clayRatio - 25) - 6);
  const siltDistance = Math.max(0, Math.abs(siltRatio - 30) - 10);

  score -= sandDistance * 2.2;
  score -= clayDistance * 2.8;
  score -= siltDistance * 1.5;

  if (sandRatio > 70) {
    score -= (sandRatio - 70) * 2.8;
  }
  if (clayRatio > 45) {
    score -= (clayRatio - 45) * 3.0;
  }

  return Math.max(0, Math.min(100, score));
}
