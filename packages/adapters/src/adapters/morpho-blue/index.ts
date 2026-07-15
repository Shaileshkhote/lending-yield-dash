import type { MarketDefinition } from "@lendingscope/core";
import type {
  LendingAdapter,
  LendingAdapterRow,
  LendingChainConfig,
  LendingFetchOptions,
  LendingMarketValues,
} from "../../types";
import {
  paginateGraphqlEndpoint,
  queryGraphqlEndpoint,
} from "../../helpers/graphql";
import { createLendingMarket } from "../../helpers/market";
import { graphqlSource } from "../../helpers/source";
import { round, toPercent, wadToPercent } from "../../helpers/units";
import { ADAPTER_VERSION } from "../../helpers/version";

const MORPHO_GRAPHQL_ENDPOINT =
  process.env.MORPHO_GRAPHQL_ENDPOINT?.trim() ||
  "https://api.morpho.org/graphql";

const DEPLOYMENTS = [
  {
    slug: "ethereum",
    chainId: 1,
    network: "Ethereum",
    startDate: "2024-01-02",
  },
  {
    slug: "arbitrum",
    chainId: 42161,
    network: "Arbitrum",
    startDate: "2025-07-15",
  },
  { slug: "base", chainId: 8453, network: "Base", startDate: "2024-05-15" },
  {
    slug: "hyperevm",
    chainId: 999,
    network: "HyperEVM",
    startDate: "2025-04-25",
  },
  {
    slug: "katana",
    chainId: 747474,
    network: "Katana",
    startDate: "2025-06-20",
  },
  { slug: "monad", chainId: 143, network: "Monad", startDate: "2025-11-20" },
  {
    slug: "optimism",
    chainId: 10,
    network: "Op Mainnet",
    startDate: "2025-01-30",
  },
  {
    slug: "polygon",
    chainId: 137,
    network: "Polygon",
    startDate: "2025-02-05",
  },
  {
    slug: "robinhood",
    chainId: 4663,
    network: "Robinhood Chain",
    startDate: "2026-06-05",
  },
  {
    slug: "unichain",
    chainId: 130,
    network: "Unichain",
    startDate: "2025-05-21",
  },
  { slug: "stable", chainId: 988, network: "Stable", startDate: "2026-04-07" },
  { slug: "tempo", chainId: 4217, network: "Tempo", startDate: "2026-05-04" },
  {
    slug: "worldchain",
    chainId: 480,
    network: "World Chain",
    startDate: "2025-12-09",
  },
];

const chainConfig: Record<string, LendingChainConfig> = Object.fromEntries(
  DEPLOYMENTS.map((deployment) => [
    deployment.slug,
    {
      start: deployment.startDate,
      chainId: deployment.chainId,
      network: deployment.network,
    },
  ]),
);

const currentCache = new Map<string, any[]>();
const historicalCache = new Map<string, any>();

const morphoBlueAdapter: LendingAdapter = {
  id: "morpho-blue",
  protocol: "Morpho Blue",
  version: ADAPTER_VERSION.OFFICIAL_GRAPHQL_SNAPSHOT,
  adapter: chainConfig,
  supportedChains: DEPLOYMENTS.map((deployment) => deployment.slug),
  dataAvailability: {
    current: true,
    history: {
      granularity: "1d",
      startDateByChain: Object.fromEntries(
        DEPLOYMENTS.map((deployment) => [
          deployment.slug,
          deployment.startDate,
        ]),
      ),
    },
  },

  async fetch(options: LendingFetchOptions): Promise<LendingAdapterRow[]> {
    const deployment = deploymentForChain(options.chain);
    const records = await loadCurrentRecords(deployment, options);
    const rows: LendingAdapterRow[] = [];

    for (const currentRecord of records) {
      const currentMarket = currentRecord.market;
      if (!isAvailableOnDate(currentMarket, options)) continue;
      if (
        options.assets?.length &&
        !options.assets.includes(currentMarket.loanAsset.symbol.toLowerCase())
      )
        continue;

      const market = marketFromRecord(deployment, currentMarket);

      try {
        const record = historyDay(options)
          ? await loadHistoricalRecord(deployment, market, options)
          : currentRecord;
        rows.push({
          market,
          blockNumber: Number(record.state.blockNumber),
          values: normalizeMarket(record),
          raw: {
            market: record.market,
            state: record.state,
          },
          source: graphqlSource({
            alias: "morphoBlue",
            endpoint: MORPHO_GRAPHQL_ENDPOINT,
            chainId: deployment.chainId,
            mode: historyDay(options) ? "historical-day" : "latest",
            extra: {
              marketId: record.market.marketId,
              collateralAsset: record.market.collateralAsset,
            },
          }),
        });
      } catch (error) {
        if (isMissingHistoricalPoint(error)) continue;
        throw error;
      }
    }

    return rows;
  },
};

async function loadCurrentRecords(
  deployment: any,
  ctx: LendingFetchOptions,
): Promise<any[]> {
  const cacheKey = `${deployment.chainId}:${ctx.assets?.join(",") ?? "all"}`;
  const cached = currentCache.get(cacheKey);
  if (cached) return cached;

  const page = await paginateGraphqlEndpoint<any, any>({
    endpoint: MORPHO_GRAPHQL_ENDPOINT,
    name: "Morpho GraphQL markets",
    query: MORPHO_MARKETS_QUERY,
    variables: { chainIds: [deployment.chainId] },
    getItems: (data) => data.markets.items,
  });
  const records = page.items
    .filter((market: any) => market.state)
    .map((market: any) => ({
      market,
      state: market.state,
    }));

  currentCache.set(cacheKey, records);
  return records;
}

async function loadCurrentRecord(
  deployment: any,
  market: MarketDefinition,
  ctx: LendingFetchOptions,
): Promise<any> {
  const records = await loadCurrentRecords(deployment, ctx);
  const record = records.find(
    (item) =>
      item.market.marketId.toLowerCase() ===
      morphoMarketId(market).toLowerCase(),
  );
  if (!record) {
    throw new Error(`Morpho market not found for ${market.id}`);
  }
  return record;
}

async function loadHistoricalRecord(
  deployment: any,
  market: MarketDefinition,
  ctx: LendingFetchOptions,
): Promise<any> {
  const day = historyDay(ctx);
  if (!day) return loadCurrentRecord(deployment, market, ctx);
  if (day < deployment.startDate) {
    throw new Error(
      `Morpho ${deployment.slug} daily history starts at ${deployment.startDate}, requested ${day}`,
    );
  }

  const start = Date.parse(`${day}T00:00:00.000Z`) / 1000;
  const end = start + 86_400;
  const cacheKey = `${deployment.chainId}:${morphoMarketId(market)}:${day}`;
  const cached = historicalCache.get(cacheKey);
  if (cached) return cached;

  const data = await queryGraphqlEndpoint<any>({
    endpoint: MORPHO_GRAPHQL_ENDPOINT,
    name: "Morpho GraphQL marketById history",
    query: MORPHO_MARKET_HISTORY_QUERY,
    variables: {
      marketId: morphoMarketId(market),
      chainId: deployment.chainId,
      start,
      end,
    },
  });

  const state = stateFromHistory(data.marketById, start);
  const record = { market: data.marketById, state };
  historicalCache.set(cacheKey, record);
  return record;
}

const MORPHO_MARKETS_QUERY = `query MorphoMarkets($first: Int!, $skip: Int!, $chainIds: [Int!]) {
  markets(first: $first, skip: $skip, orderBy: SupplyAssetsUsd, orderDirection: Desc, where: { chainId_in: $chainIds, listed: true }) {
    items {
      marketId
      chain { id network }
      creationBlockNumber
      creationTimestamp
      listed
      lltv
      loanAsset { address symbol decimals name }
      collateralAsset { address symbol decimals name }
      morphoBlue { address }
      state {
        blockNumber
        timestamp
        supplyAssetsUsd
        borrowAssetsUsd
        liquidityAssetsUsd
        utilization
        supplyApy
        borrowApy
        netSupplyApy
        netBorrowApy
        fee
      }
    }
  }
}`;

const MORPHO_MARKET_HISTORY_QUERY = `query MorphoMarketHistory($marketId: String!, $chainId: Int!, $start: Int!, $end: Int!) {
  marketById(marketId: $marketId, chainId: $chainId) {
    marketId
    chain { id network }
    creationBlockNumber
    creationTimestamp
    listed
    lltv
    loanAsset { address symbol decimals name }
    collateralAsset { address symbol decimals name }
    morphoBlue { address }
    state {
      blockNumber
      timestamp
      supplyAssetsUsd
      borrowAssetsUsd
      liquidityAssetsUsd
      utilization
      supplyApy
      borrowApy
      netSupplyApy
      netBorrowApy
      fee
    }
    historicalState {
      supplyAssetsUsd(options: { startTimestamp: $start, endTimestamp: $end, interval: DAY }) { x y }
      borrowAssetsUsd(options: { startTimestamp: $start, endTimestamp: $end, interval: DAY }) { x y }
      liquidityAssetsUsd(options: { startTimestamp: $start, endTimestamp: $end, interval: DAY }) { x y }
      utilization(options: { startTimestamp: $start, endTimestamp: $end, interval: DAY }) { x y }
      supplyApy(options: { startTimestamp: $start, endTimestamp: $end, interval: DAY }) { x y }
      borrowApy(options: { startTimestamp: $start, endTimestamp: $end, interval: DAY }) { x y }
      netSupplyApy(options: { startTimestamp: $start, endTimestamp: $end, interval: DAY }) { x y }
      netBorrowApy(options: { startTimestamp: $start, endTimestamp: $end, interval: DAY }) { x y }
    }
  }
}`;

function marketFromRecord(
  deployment: any,
  market: any,
): MarketDefinition {
  const collateral = market.collateralAsset?.symbol
    ? `-${market.collateralAsset.symbol.toLowerCase()}`
    : "";
  return createLendingMarket({
    id: `${morphoBlueAdapter.id}-${deployment.slug}-${market.loanAsset.symbol.toLowerCase()}${collateral}-${market.marketId.toLowerCase()}`,
    protocol: morphoBlueAdapter.protocol,
    chain: deployment.slug,
    adapterId: morphoBlueAdapter.id,
    marketType: "isolated",
    assetSymbol: market.loanAsset.symbol,
    assetAddress: market.loanAsset.address,
    assetDecimals: Number(market.loanAsset.decimals),
    sourceMethod: "Morpho GraphQL markets/marketById query",
    contracts: [market.morphoBlue.address, market.marketId],
  });
}

function normalizeMarket(record: any): LendingMarketValues {
  return {
    supplyApy: percentValue(record.state.supplyApy),
    borrowApy: percentValue(record.state.borrowApy),
    rewardSupplyApy: netRewardPercent(
      record.state.netSupplyApy,
      record.state.supplyApy,
    ),
    rewardBorrowApy: netRewardPercent(
      record.state.borrowApy,
      record.state.netBorrowApy,
    ),
    totalSuppliedUsd: numberOrNull(record.state.supplyAssetsUsd),
    totalBorrowedUsd: numberOrNull(record.state.borrowAssetsUsd),
    availableLiquidityUsd: numberOrNull(record.state.liquidityAssetsUsd),
    utilization: percentValue(record.state.utilization),
    ltv: wadPercentValue(record.market.lltv),
    liquidationThreshold: wadPercentValue(record.market.lltv),
    reserveFactor: percentValue(record.state.fee),
    supplyCapUsd: null,
    borrowCapUsd: null,
    isActive: record.market.listed,
    isPaused: false,
  };
}

function stateFromHistory(
  market: any,
  targetTimestamp: number,
): any {
  const history = market.historicalState;
  if (!history) {
    throw new Error(`Morpho market ${market.marketId} has no historical state`);
  }

  const supplyAssetsUsd = closestPoint(
    history.supplyAssetsUsd,
    targetTimestamp,
  );
  if (!supplyAssetsUsd) {
    throw new Error(
      `Morpho market ${market.marketId} has no daily history at ${new Date(targetTimestamp * 1000).toISOString().slice(0, 10)}`,
    );
  }

  const timestamp = supplyAssetsUsd.x;
  return {
    blockNumber: 0,
    timestamp,
    supplyAssetsUsd: supplyAssetsUsd.y,
    borrowAssetsUsd:
      closestPoint(history.borrowAssetsUsd, timestamp)?.y ?? null,
    liquidityAssetsUsd:
      closestPoint(history.liquidityAssetsUsd, timestamp)?.y ?? null,
    utilization: closestPoint(history.utilization, timestamp)?.y ?? 0,
    supplyApy: closestPoint(history.supplyApy, timestamp)?.y ?? 0,
    borrowApy: closestPoint(history.borrowApy, timestamp)?.y ?? 0,
    netSupplyApy: closestPoint(history.netSupplyApy, timestamp)?.y ?? null,
    netBorrowApy: closestPoint(history.netBorrowApy, timestamp)?.y ?? null,
    fee: market.state?.fee ?? 0,
  };
}

function isMissingHistoricalPoint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(" has no daily history at ");
}

function closestPoint(
  points: any[],
  target: number,
): any | undefined {
  return points
    .filter((point) => point.y !== null)
    .sort((a, b) => Math.abs(a.x - target) - Math.abs(b.x - target))[0];
}

function deploymentForChain(chain: string): any {
  const deployment = DEPLOYMENTS.find((item) => item.slug === chain);
  if (!deployment) {
    throw new Error(`No Morpho deployment configured for ${chain}`);
  }
  return deployment;
}

function morphoMarketId(market: MarketDefinition): string {
  const marketId = market.contracts[1];
  if (!marketId) {
    throw new Error(`Missing Morpho market id in contracts for ${market.id}`);
  }
  return marketId;
}

function historyDay(ctx: LendingFetchOptions): string | undefined {
  return ctx.runMode === "daily" ? ctx.dateString : undefined;
}

function isAvailableOnDate(market: any, ctx: LendingFetchOptions): boolean {
  const day = historyDay(ctx);
  if (!day) return true;
  const end = Date.parse(`${day}T23:59:59.999Z`) / 1000;
  return Number(market.creationTimestamp) <= end;
}

function percentValue(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : toPercent(value);
}

function wadPercentValue(value: string): number | null {
  try {
    return wadToPercent(BigInt(value));
  } catch {
    return null;
  }
}

function netRewardPercent(
  net: number | null | undefined,
  base: number | null | undefined,
): number | null {
  if (net === null || net === undefined || base === null || base === undefined)
    return null;
  return round((net - base) * 100, 6);
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? round(value, 6)
    : null;
}

export { morphoBlueAdapter };
