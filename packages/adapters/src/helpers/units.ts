const SECONDS_PER_YEAR = 31_536_000;

export function unitsToNumber(value: bigint, decimals: number): number {
  return Number(value) / 10 ** decimals;
}

export function rayAprToApy(rateRay: bigint): number {
  const apr = Number(rateRay) / 1e27;
  return toPercent(Math.exp(apr) - 1);
}

export function aprPercentToApy(ratePercent: number): number {
  return toPercent(Math.exp(ratePercent / 100) - 1);
}

export function perSecondRateToApy(rate: bigint, scale = 1e18): number {
  const perSecond = Number(rate) / scale;
  return toPercent((1 + perSecond) ** SECONDS_PER_YEAR - 1);
}

export function wadToPercent(value: bigint): number {
  return toPercent(Number(value) / 1e18);
}

export function bpsToPercent(value: bigint | number): number {
  return Number(value) / 100;
}

export function capToUsd(cap: bigint, decimals: number, priceUsd: number): number | null {
  if (cap === 0n) return null;
  return unitsToNumber(cap, decimals) * priceUsd;
}

export function toPercent(value: number): number {
  return round(value * 100, 6);
}

export function round(value: number, decimals = 6): number {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
