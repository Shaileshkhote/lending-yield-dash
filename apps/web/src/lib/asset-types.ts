import type { LendingMarket } from "./api";

export type AssetType = "stablecoins" | "bluechips" | "alts";

export const assetTypeOptions: Array<{ value: "all" | AssetType; label: string }> = [
  { value: "all", label: "All Types" },
  { value: "stablecoins", label: "Stablecoins" },
  { value: "bluechips", label: "Bluechips" },
  { value: "alts", label: "Alts" },
];

const stablecoinSymbols = new Set([
  "USDC",
  "USDT",
  "DAI",
  "USDS",
  "SUSDS",
  "USDE",
  "SUSDE",
  "FRAX",
  "LUSD",
  "GHO",
  "PYUSD",
  "USDP",
  "USDBC",
  "USD0",
  "USD0++",
  "RLUSD",
  "TUSD",
  "CRVUSD",
  "MIM",
]);

const bluechipSymbols = new Set([
  "ETH",
  "WETH",
  "WSTETH",
  "STETH",
  "WBTC",
  "CBETH",
  "RETH",
  "AAVE",
  "LINK",
  "MKR",
  "SKY",
  "UNI",
]);

export function assetTypeForMarket(market: LendingMarket): AssetType {
  const symbol = market.assetSymbol.toUpperCase();
  if (stablecoinSymbols.has(symbol)) return "stablecoins";
  if (bluechipSymbols.has(symbol)) return "bluechips";
  return "alts";
}
