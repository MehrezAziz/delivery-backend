/** Coin amounts: 3 decimal places, always round up (e.g. 10.3751 → 10.376). */
export function ceilCoins3(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(n * 1000 - 1e-9) / 1000;
}
