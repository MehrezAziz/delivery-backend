/** Fee taken from the user's requested withdrawal total (not added on top). */
export function withdrawalFeeCoinsFromGross(grossDebitCoins: number, feeBps: number): number {
  if (!Number.isFinite(grossDebitCoins) || grossDebitCoins <= 0 || feeBps <= 0) {
    return 0;
  }
  return Math.round(((grossDebitCoins * feeBps) / 10000) * 100) / 100;
}

export function splitWithdrawalGross(
  grossDebitCoins: number,
  feeBps: number,
): { grossDebit: number; feeCoins: number; netPayout: number } {
  const grossDebit = Math.round(grossDebitCoins * 100) / 100;
  const feeCoins = withdrawalFeeCoinsFromGross(grossDebit, feeBps);
  const netPayout = Math.round((grossDebit - feeCoins) * 100) / 100;
  return { grossDebit, feeCoins, netPayout };
}
