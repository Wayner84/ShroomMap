export function scoreMoistureProxy(bdod: number): number {
  if (!Number.isFinite(bdod)) {
    return 0;
  }
  const density = bdod / 1000; // convert kg/m3 to g/cm3
  if (density <= 0.8) {
    return 60;
  }
  if (density < 1.05) {
    return 80 + ((density - 0.8) / 0.25) * 20;
  }
  if (density <= 1.35) {
    return 100;
  }
  if (density <= 1.6) {
    return 100 - ((density - 1.35) / 0.25) * 30;
  }
  if (density <= 1.8) {
    return 70 - ((density - 1.6) / 0.2) * 40;
  }
  return 20;
}
