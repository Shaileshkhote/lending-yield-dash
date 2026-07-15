import type {
  AdapterContext,
  CanonicalMarketSnapshot,
  MarketDefinition,
  RawMarketSnapshot,
} from "@lendingscope/core";
import type {
  LendingAdapter,
  LendingChainConfig,
  LendingFetchOptions,
  LendingFetchResult,
} from "../../types";
import { CHAIN } from "../../helpers/chains";
import { queryTheGraph } from "../../helpers/graphql";
import {
  buildRawMarketSnapshot,
  normalizeProtocolSnapshot,
  type ProtocolMarketState,
} from "../../helpers/protocol-snapshot";
import { aprPercentToApy, round } from "../../helpers/units";
import { ADAPTER_VERSION } from "../../helpers/version";

type CompoundDeployment = {
  chain: string;
  protocol: string;
  adapterId: string;
  subgraphId: string;
};

type CompoundToken = {
  id: string;
  symbol: string;
  decimals: number | string;
};

type CompoundRate = {
  rate: string;
  side: string;
  type: string;
};

type CompoundMarket = {
  id: string;
  name?: string | null;
  inputToken: CompoundToken;
  totalDepositBalanceUSD?: string | null;
  totalBorrowBalanceUSD?: string | null;
  totalValueLockedUSD?: string | null;
  maximumLTV?: string | null;
  liquidationThreshold?: string | null;
  reserveFactor?: string | null;
  isActive?: boolean | null;
  rates?: CompoundRate[] | null;
};

type CompoundDailySnapshot = {
  id: string;
  timestamp: string;
  blockNumber: string;
  market: CompoundMarket;
  totalDepositBalanceUSD?: string | null;
  totalBorrowBalanceUSD?: string | null;
  totalValueLockedUSD?: string | null;
  reserveFactor?: string | null;
  rates?: CompoundRate[] | null;
};

type CompoundMarketRecord = {
  market: CompoundMarket;
  blockNumber: number;
};

type CompoundMarketsQueryData = {
  _meta?: { block?: { number?: number } };
  markets: CompoundMarket[];
};

type CompoundDailySnapshotsQueryData = {
  marketDailySnapshots: CompoundDailySnapshot[];
};

const DEPLOYMENTS: CompoundDeployment[] = [
  {
    chain: CHAIN.ETHEREUM,
    protocol: "Compound III",
    adapterId: "compound-v3",
    subgraphId:
      process.env.COMPOUND_V3_ETHEREUM_SUBGRAPH_ID ??
      "AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9",
  },
  ...optionalSubgraphDeployment(
    CHAIN.BASE,
    process.env.COMPOUND_V3_BASE_SUBGRAPH_ID,
  ),
];

const chainConfig: Record<string, LendingChainConfig> = Object.fromEntries(
  DEPLOYMENTS.map((deployment) => [
    deployment.chain,
    {
      start: deployment.chain === CHAIN.ETHEREUM ? "2022-08-13" : "2023-01-01",
      subgraphId: deployment.subgraphId,
    },
  ]),
);

const recordCache = new Map<string, CompoundMarketRecord[]>();

const compoundV3Adapter: LendingAdapter = {
  id: "compound-v3",
  protocol: "Compound III",
  version: ADAPTER_VERSION.GRAPHQL_SUBGRAPH_SNAPSHOT,
  adapter: chainConfig,
  supportedChains: DEPLOYMENTS.map((deployment) => deployment.chain),
  dataAvailability: {
    current: true,
    history: {
      granularity: "1d",
      startDateByChain: {
        [CHAIN.ETHEREUM]: "2022-08-13",
      },
    },
  },

  async fetch(options: LendingFetchOptions): Promise<LendingFetchResult> {
    const deployment = deploymentForChain(options.chain);
    const records = await loadMarketRecords(deployment, options);
    const markets: MarketDefinition[] = [];
    const rawPayloads: RawMarketSnapshot[] = [];
    const snapshots: CanonicalMarketSnapshot[] = [];

    for (const record of records) {
      const marketRecord = record.market;
      if (!marketRecord.rates?.length) continue;
      if (
        options.assets?.length &&
        !options.assets.includes(marketRecord.inputToken.symbol.toLowerCase())
      )
        continue;

      const market = marketFromRecord(deployment, marketRecord);
      const raw = buildRawMarketSnapshot({
        adapterId: deployment.adapterId,
        market,
        ctx: options,
        blockNumber: record.blockNumber,
        protocolResponse: {
          reserve: normalizeMarket(marketRecord),
          rawMarket: marketRecord,
          subgraph: {
            id: deployment.subgraphId,
            blockNumber: record.blockNumber.toString(),
          },
        },
      });
      markets.push(market);
      rawPayloads.push(raw);
      snapshots.push(normalizeProtocolSnapshot(raw));
    }

    return {
      markets,
      rawPayloads,
      snapshots,
    };
  },
};

async function loadMarketRecords(
  deployment: CompoundDeployment,
  ctx: AdapterContext,
): Promise<CompoundMarketRecord[]> {
  const cacheKey = `${deployment.subgraphId}:${historyDay(ctx) ?? "latest"}:${ctx.assets?.join(",") ?? "all"}`;
  const cached = recordCache.get(cacheKey);
  if (cached) return cached;

  const records = historyDay(ctx)
    ? await loadDailyRecords(deployment, ctx)
    : await loadCurrentRecords(deployment);
  recordCache.set(cacheKey, records);
  return records;
}

async function loadCurrentRecords(
  deployment: CompoundDeployment,
): Promise<CompoundMarketRecord[]> {
  const markets: CompoundMarket[] = [];
  let metaBlock = 0;
  for (let skip = 0; ; skip += 1000) {
    const data = await queryTheGraph<CompoundMarketsQueryData>({
      subgraphId: deployment.subgraphId,
      query: currentMarketsQuery(),
      variables: { first: 1000, skip },
    });
    markets.push(...data.markets);
    metaBlock = data._meta?.block?.number ?? metaBlock;
    if (data.markets.length < 1000) break;
  }
  return markets.map((market) => ({ market, blockNumber: metaBlock }));
}

async function loadDailyRecords(
  deployment: CompoundDeployment,
  ctx: AdapterContext,
): Promise<CompoundMarketRecord[]> {
  const day = historyDay(ctx);
  if (!day) return loadCurrentRecords(deployment);
  const start = Date.parse(`${day}T00:00:00.000Z`) / 1000;
  const end = start + 86_400;
  const snapshots: CompoundDailySnapshot[] = [];
  for (let skip = 0; ; skip += 1000) {
    const data = await queryTheGraph<CompoundDailySnapshotsQueryData>({
      subgraphId: deployment.subgraphId,
      query: dailySnapshotsQuery(),
      variables: { first: 1000, skip, start, end },
    });
    snapshots.push(...data.marketDailySnapshots);
    if (data.marketDailySnapshots.length < 1000) break;
  }
  return snapshots.map((snapshot) => ({
    market: marketFromSnapshot(snapshot),
    blockNumber: Number(snapshot.blockNumber),
  }));
}

function currentMarketsQuery(): string {
  return `query CompoundMarkets($first: Int!, $skip: Int!) {
    _meta { block { number } }
    markets(first: $first, skip: $skip, orderBy: id, orderDirection: asc) {
      id
      name
      inputToken { id symbol decimals }
      totalDepositBalanceUSD
      totalBorrowBalanceUSD
      totalValueLockedUSD
      maximumLTV
      liquidationThreshold
      reserveFactor
      isActive
      rates { rate side type }
    }
  }`;
}

function dailySnapshotsQuery(): string {
  return `query CompoundDailySnapshots($first: Int!, $skip: Int!, $start: Int!, $end: Int!) {
    marketDailySnapshots(first: $first, skip: $skip, where: { timestamp_gte: $start, timestamp_lt: $end }, orderBy: id, orderDirection: asc) {
      id
      timestamp
      blockNumber
      market {
        id
        name
        inputToken { id symbol decimals }
        maximumLTV
        liquidationThreshold
        reserveFactor
        isActive
        rates { rate side type }
      }
      totalDepositBalanceUSD
      totalBorrowBalanceUSD
      totalValueLockedUSD
      reserveFactor
      rates { rate side type }
    }
  }`;
}

function marketFromSnapshot(snapshot: CompoundDailySnapshot): CompoundMarket {
  return {
    ...snapshot.market,
    totalDepositBalanceUSD: snapshot.totalDepositBalanceUSD,
    totalBorrowBalanceUSD: snapshot.totalBorrowBalanceUSD,
    totalValueLockedUSD: snapshot.totalValueLockedUSD,
    reserveFactor: snapshot.reserveFactor ?? snapshot.market.reserveFactor,
    rates: snapshot.rates?.length ? snapshot.rates : snapshot.market.rates,
  };
}

function marketFromRecord(
  deployment: CompoundDeployment,
  market: CompoundMarket,
): MarketDefinition {
  return {
    id: `${deployment.adapterId}-${deployment.chain}-${market.inputToken.symbol.toLowerCase()}-${market.id.toLowerCase()}`,
    protocol: deployment.protocol,
    chain: deployment.chain,
    adapterId: deployment.adapterId,
    marketType: "comet",
    assetSymbol: market.inputToken.symbol,
    assetAddress: market.inputToken.id,
    assetDecimals: Number(market.inputToken.decimals),
    sourceMethod: "The Graph Compound markets/dailySnapshots query",
    contracts: [market.id, deployment.subgraphId],
  };
}

function normalizeMarket(market: CompoundMarket): ProtocolMarketState {
  const suppliedUsd = numberOrNull(market.totalDepositBalanceUSD);
  const borrowedUsd = numberOrNull(market.totalBorrowBalanceUSD);
  const tvlUsd = numberOrNull(market.totalValueLockedUSD);
  return {
    supplyApy: rateFor(market, "LENDER"),
    borrowApy: rateFor(market, "BORROWER"),
    rewardSupplyApy: null,
    rewardBorrowApy: null,
    totalSuppliedUsd: suppliedUsd,
    totalBorrowedUsd: borrowedUsd,
    availableLiquidityUsd:
      suppliedUsd === null || borrowedUsd === null
        ? tvlUsd
        : round(Math.max(suppliedUsd - borrowedUsd, 0), 2),
    utilization:
      suppliedUsd && borrowedUsd !== null
        ? round((borrowedUsd / suppliedUsd) * 100, 6)
        : null,
    ltv: percentValue(market.maximumLTV),
    liquidationThreshold: percentValue(market.liquidationThreshold),
    reserveFactor: fractionPercentValue(market.reserveFactor),
    supplyCapUsd: null,
    borrowCapUsd: null,
    isActive: market.isActive ?? true,
    isPaused: false,
  };
}

function historyDay(ctx: AdapterContext): string | undefined {
  const day = ctx.now.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return day < today ? day : undefined;
}

function rateFor(
  market: CompoundMarket,
  side: "LENDER" | "BORROWER",
): number | null {
  const rate =
    market.rates?.find(
      (item) =>
        item.side.toUpperCase() === side &&
        item.type.toUpperCase() === "VARIABLE",
    ) ?? market.rates?.find((item) => item.side.toUpperCase() === side);
  const value = numberOrNull(rate?.rate);
  return value === null ? null : aprPercentToApy(value);
}

function numberOrNull(value: string | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentValue(value: string | null | undefined): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function fractionPercentValue(value: string | null | undefined): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function optionalSubgraphDeployment(
  chain: string,
  subgraphId?: string,
): CompoundDeployment[] {
  if (!subgraphId) return [];
  return [
    { chain, protocol: "Compound III", adapterId: "compound-v3", subgraphId },
  ];
}

function deploymentForChain(chain: string): CompoundDeployment {
  const deployment = DEPLOYMENTS.find((item) => item.chain === chain);
  if (!deployment) {
    throw new Error(
      `No Compound III subgraph deployment configured for ${chain}`,
    );
  }
  return deployment;
}

export { compoundV3Adapter };
