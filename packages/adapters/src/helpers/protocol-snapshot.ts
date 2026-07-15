import {
  canonicalMarketSnapshotSchema,
  sha256,
  type AdapterContext,
  type CanonicalMarketSnapshot,
  type MarketDefinition,
  type RawMarketSnapshot
} from "@lendingscope/core";
import type {
  LendingAdapterMarket,
  LendingAdapterRow,
  LendingMarketValues,
  LendingSnapshotResult
} from "../types";

export function buildLendingSnapshotResult(args: {
  adapterId: string;
  ctx: AdapterContext;
  rows: LendingAdapterRow[];
}): LendingSnapshotResult {
  const markets: MarketDefinition[] = [];
  const rawPayloads: RawMarketSnapshot[] = [];
  const snapshots: CanonicalMarketSnapshot[] = [];

  for (const row of args.rows) {
    const market = normalizeMarketDefinition(args.adapterId, row.market);
    const raw = buildRawMarketSnapshot({
      adapterId: args.adapterId,
      market,
      ctx: args.ctx,
      blockNumber: Number(row.blockNumber ?? args.ctx.blockNumbers?.[market.chain] ?? 0),
      protocolResponse: {
        reserve: row.values,
        raw: row.raw,
        ...(row.source ?? {})
      }
    });
    markets.push(market);
    rawPayloads.push(raw);
    snapshots.push(normalizeProtocolSnapshot(raw));
  }

  return { markets, rawPayloads, snapshots };
}

export function buildRawMarketSnapshot(args: {
  adapterId: string;
  market: MarketDefinition;
  ctx: AdapterContext;
  blockNumber: number;
  protocolResponse: Record<string, unknown>;
}): RawMarketSnapshot {
  const { adapterId, market, ctx, blockNumber, protocolResponse } = args;
  const timestamp = ctx.now.toISOString();
  const payload = {
    source: {
      adapterId,
      method: market.sourceMethod,
      chain: market.chain,
      contracts: market.contracts
    },
    market,
    protocolResponse
  };

  return {
    runId: ctx.runId,
    adapterId,
    protocol: market.protocol,
    chain: market.chain,
    marketId: market.id,
    blockNumber,
    sourceMethod: market.sourceMethod,
    contracts: market.contracts,
    collectedAt: timestamp,
    payloadHash: sha256(payload),
    payload
  };
}

export function normalizeProtocolSnapshot(raw: RawMarketSnapshot): CanonicalMarketSnapshot {
  const market = raw.payload.market as MarketDefinition;
  const protocolResponse = raw.payload.protocolResponse as { reserve?: LendingMarketValues };
  const reserve = protocolResponse.reserve;
  if (!reserve) {
    throw new Error(`Missing reserve payload for ${raw.marketId}`);
  }

  const supplyApy = nullableNumber(reserve.supplyApy);
  const rewardSupplyApy = nullableNumber(reserve.rewardSupplyApy);

  return canonicalMarketSnapshotSchema.parse({
    timestamp: raw.collectedAt,
    blockNumber: raw.blockNumber,
    protocol: raw.protocol,
    adapterId: raw.adapterId,
    chain: raw.chain,
    marketId: raw.marketId,
    marketType: market.marketType,
    assetSymbol: market.assetSymbol,
    assetAddress: market.assetAddress,
    supplyApy,
    borrowApy: nullableNumber(reserve.borrowApy),
    rewardSupplyApy,
    rewardBorrowApy: nullableNumber(reserve.rewardBorrowApy),
    netSupplyApy: supplyApy === null ? null : supplyApy + (rewardSupplyApy ?? 0),
    totalSuppliedUsd: nullableNumber(reserve.totalSuppliedUsd),
    totalBorrowedUsd: nullableNumber(reserve.totalBorrowedUsd),
    availableLiquidityUsd: nullableNumber(reserve.availableLiquidityUsd),
    utilization: nullableNumber(reserve.utilization),
    ltv: nullableNumber(reserve.ltv),
    liquidationThreshold: nullableNumber(reserve.liquidationThreshold),
    reserveFactor: nullableNumber(reserve.reserveFactor),
    supplyCapUsd: nullableNumber(reserve.supplyCapUsd),
    borrowCapUsd: nullableNumber(reserve.borrowCapUsd),
    isActive: reserve.isActive ?? true,
    isPaused: reserve.isPaused ?? false,
    dataQualityScore: 100,
    source: {
      payloadHash: raw.payloadHash,
      method: raw.sourceMethod,
      contracts: raw.contracts
    }
  });
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeMarketDefinition(adapterId: string, market: MarketDefinition | LendingAdapterMarket): MarketDefinition {
  const id = market.id ?? buildMarketId(adapterId, market.chain, market.assetSymbol, market.assetAddress);
  return {
    id,
    protocol: market.protocol,
    chain: market.chain,
    adapterId: market.adapterId,
    marketType: market.marketType,
    assetSymbol: market.assetSymbol,
    assetAddress: market.assetAddress,
    assetDecimals: market.assetDecimals,
    sourceMethod: market.sourceMethod,
    contracts: market.contracts?.length ? market.contracts : [market.assetAddress]
  };
}

function buildMarketId(adapterId: string, chain: string, symbol: string, address: string): string {
  return `${adapterId}-${chain}-${symbol.toLowerCase()}-${address.toLowerCase()}`;
}
