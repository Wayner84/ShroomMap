export function scoreOrganicCarbon(orcdrc: number): number {
  if (!Number.isFinite(orcdrc)) {
    return 0;
  }
  const percent = orcdrc / 10; // convert g/kg to %
  if (percent <= 0.5) {
    return 5;
  }
  if (percent < 3) {
    return Math.min(100, ((percent - 0.5) / 2.5) * 80 + 20);
  }
  if (percent <= 6) {
    return 100;
  }
  if (percent <= 10) {
    return 100 - ((percent - 6) / 4) * 50;
  }
  if (percent <= 15) {
    return Math.max(20, 50 - ((percent - 10) / 5) * 50);
  }
  return 10;
}
