import type { MarketDefinition, MarketType } from "@lendingscope/core";

export function createLendingMarket(args: {
  id?: string;
  adapterId: string;
  protocol: string;
  chain: string;
  marketType: MarketType;
  assetSymbol: string;
  assetAddress: string;
  assetDecimals: number | string;
  sourceMethod: string;
  contracts?: string[];
}): MarketDefinition {
  const assetAddress = args.assetAddress.toLowerCase();
  return {
    id:
      args.id ??
      `${args.adapterId}-${args.chain}-${args.assetSymbol.toLowerCase()}-${assetAddress}`,
    protocol: args.protocol,
    chain: args.chain,
    adapterId: args.adapterId,
    marketType: args.marketType,
    assetSymbol: args.assetSymbol,
    assetAddress: args.assetAddress,
    assetDecimals: Number(args.assetDecimals),
    sourceMethod: args.sourceMethod,
    contracts: args.contracts?.length ? args.contracts : [args.assetAddress],
  };
}
