import type {
  AdapterContext,
  CanonicalMarketSnapshot,
  MarketDefinition,
  RawMarketSnapshot,
} from "@stablewatch-lending/core";
import type {
  LendingAdapter,
  LendingChainConfig,
  LendingFetchOptions,
  LendingFetchResult,
} from "../../types";
import { CHAIN } from "../../helpers/chains";
import { queryGraphqlEndpoint } from "../../helpers/graphql";
import {
  buildRawMarketSnapshot,
  normalizeProtocolSnapshot,
  type ProtocolMarketState,
} from "../../helpers/protocol-snapshot";
import { round, toPercent } from "../../helpers/units";
import { ADAPTER_VERSION } from "../../helpers/version";

type AaveV4Deployment = {
  chain: string;
  chainId: number;
  protocol: string;
  adapterId: string;
};

type AaveV4PercentNumber = {
  value: string;
  normalized?: string;
};

type AaveV4DecimalNumber = {
  value: string;
  decimals: number;
  onChainValue: string;
};

type AaveV4Erc20Amount = {
  amount: AaveV4DecimalNumber;
  exchange?: { value: string } | null;
};

type AaveV4TokenInfo = {
  name: string;
  symbol: string;
  decimals: number;
};

type AaveV4Reserve = {
  id: string;
  onChainId: string;
  chain: {
    name: string;
    chainId: number;
  };
  spoke: {
    id: string;
    name: string;
    address: string;
    chain: {
      name: string;
      chainId: number;
    };
  };
  asset: {
    id: string;
    hub: {
      id: string;
      name: string;
      address: string;
      chain: {
        name: string;
        chainId: number;
      };
    };
    underlying: {
      address: string;
      chain: {
        name: string;
        chainId: number;
      };
      info: AaveV4TokenInfo;
    };
    summary: {
      supplied: AaveV4Erc20Amount;
      borrowed: AaveV4Erc20Amount;
      availableLiquidity: AaveV4Erc20Amount;
      supplyApy: AaveV4PercentNumber;
      borrowApy: AaveV4PercentNumber;
      netApy: AaveV4PercentNumber;
      utilizationRate: AaveV4PercentNumber;
    };
    settings: {
      liquidityFee: AaveV4PercentNumber;
    };
  };
  summary: {
    supplied: AaveV4Erc20Amount;
    borrowed: AaveV4Erc20Amount;
    suppliable: AaveV4Erc20Amount;
    borrowable: AaveV4Erc20Amount;
    supplyApy: AaveV4PercentNumber;
    borrowApy: AaveV4PercentNumber;
  };
  settings: {
    collateralFactor: AaveV4PercentNumber;
    maxLiquidationBonus: AaveV4PercentNumber;
    liquidationFee: AaveV4PercentNumber;
    borrowable: boolean;
    collateral: boolean;
    suppliable: boolean;
    borrowCap: AaveV4Erc20Amount;
    supplyCap: AaveV4Erc20Amount;
  };
  status: {
    frozen: boolean;
    paused: boolean;
    active: boolean;
  };
  canBorrow: boolean;
  canSupply: boolean;
  canUseAsCollateral: boolean;
};

type AaveV4ReservesQueryData = {
  reserves: AaveV4Reserve[];
};

type AaveV4HistorySample = {
  date: string;
  amount: { value: string };
  averageApy: AaveV4PercentNumber;
  breakdown: Array<{
    hub: { id: string; name: string };
    amount: { value: string };
    apy: AaveV4PercentNumber;
  }>;
};

type AaveV4PriceSample = {
  date: string;
  price: string;
};

type AaveV4HistoryQueryData = {
  assetSupplyHistory: AaveV4HistorySample[];
  assetBorrowHistory: AaveV4HistorySample[];
  assetPriceHistory: AaveV4PriceSample[];
};

type AaveV4HubAssetMarket = {
  assetId: string;
  hub: AaveV4Reserve["asset"]["hub"];
  underlying: AaveV4Reserve["asset"]["underlying"];
  summary: AaveV4Reserve["asset"]["summary"];
  settings: AaveV4Reserve["asset"]["settings"];
  reserves: AaveV4Reserve[];
};

type AaveV4HistoryWindow = "LAST_MONTH" | "LAST_YEAR";

type AaveV4MarketHistory = {
  window: AaveV4HistoryWindow;
  supply: AaveV4HistorySample[];
  borrow: AaveV4HistorySample[];
  prices: AaveV4PriceSample[];
};

const AAVE_V4_GRAPHQL_ENDPOINT =
  process.env.AAVE_V4_GRAPHQL_ENDPOINT?.trim() ||
  "https://api.v4.aave.com/graphql";
const AAVE_V4_HISTORY_START_DATE =
  process.env.AAVE_V4_HISTORY_START_DATE?.trim() || "2026-03-30";

const DEPLOYMENTS: AaveV4Deployment[] = [
  {
    chain: CHAIN.ETHEREUM,
    chainId: 1,
    protocol: "Aave V4",
    adapterId: "aave-v4",
  },
];

const chainConfig: Record<string, LendingChainConfig> = Object.fromEntries(
  DEPLOYMENTS.map((deployment) => [
    deployment.chain,
    {
      start: aaveV4HistoryStartDate(),
      chainId: deployment.chainId,
      endpoint: AAVE_V4_GRAPHQL_ENDPOINT,
    },
  ]),
);

const reserveCache = new Map<string, AaveV4Reserve[]>();
const historyCache = new Map<string, AaveV4HistoryQueryData>();

const aaveV4Adapter: LendingAdapter = {
  id: "aave-v4",
  protocol: "Aave V4",
  version: ADAPTER_VERSION.OFFICIAL_GRAPHQL_SNAPSHOT,
  adapter: chainConfig,
  supportedChains: DEPLOYMENTS.map((deployment) => deployment.chain),
  dataAvailability: {
    current: true,
    history: {
      granularity: "1d",
      startDateByChain: {
        [CHAIN.ETHEREUM]: aaveV4HistoryStartDate(),
      },
    },
  },

  async fetch(options: LendingFetchOptions): Promise<LendingFetchResult> {
    const deployment = deploymentForChain(options.chain);
    const marketsForChain = groupHubAssetMarkets(
      await loadReserves(deployment, options),
    );
    const historyDayValue = historyDay(options);
    const historyWindow = historyDayValue
      ? historyWindowForDay(historyDayValue)
      : undefined;
    const markets: MarketDefinition[] = [];
    const rawPayloads: RawMarketSnapshot[] = [];
    const snapshots: CanonicalMarketSnapshot[] = [];

    for (const hubAsset of marketsForChain) {
      const token = hubAsset.underlying.info;
      if (
        options.assets?.length &&
        !options.assets.includes(token.symbol.toLowerCase())
      )
        continue;

      const market = marketFromHubAsset(deployment, hubAsset);
      const history = historyWindow
        ? await loadMarketHistory(deployment, hubAsset, historyWindow)
        : undefined;
      const reserve = historyDayValue
        ? normalizeHistoricalHubAsset(hubAsset, historyDayValue, history)
        : normalizeHubAsset(hubAsset);

      if (historyDayValue && !reserve) continue;

      const raw = buildRawMarketSnapshot({
        adapterId: this.id,
        market,
        ctx: options,
        blockNumber: Number(options.blockNumber ?? 0n),
        protocolResponse: {
          reserve,
          rawHubAsset: hubAsset,
          aaveV4Graphql: {
            endpoint: AAVE_V4_GRAPHQL_ENDPOINT,
            chainId: deployment.chainId,
            hubId: hubAsset.hub.id,
            hubAddress: hubAsset.hub.address,
            assetId: hubAsset.assetId,
            mode: historyDayValue ? "historical-history" : "latest",
            historyDay: historyDayValue,
            historyWindow,
          },
        },
      });
      markets.push(market);
      rawPayloads.push(raw);
      snapshots.push(normalizeProtocolSnapshot(raw));
    }

    return { markets, rawPayloads, snapshots };
  },
};

async function loadReserves(
  deployment: AaveV4Deployment,
  ctx: AdapterContext,
): Promise<AaveV4Reserve[]> {
  const cacheKey = `${deployment.chainId}:${ctx.assets?.join(",") ?? "all"}`;
  const cached = reserveCache.get(cacheKey);
  if (cached) return cached;

  const data = await queryGraphqlEndpoint<AaveV4ReservesQueryData>({
    endpoint: AAVE_V4_GRAPHQL_ENDPOINT,
    name: "Aave V4 GraphQL reserves",
    query: AAVE_V4_RESERVES_QUERY,
    variables: { chainIds: [deployment.chainId] },
  });

  reserveCache.set(cacheKey, data.reserves);
  return data.reserves;
}

async function loadMarketHistory(
  deployment: AaveV4Deployment,
  market: AaveV4HubAssetMarket,
  window: AaveV4HistoryWindow,
): Promise<AaveV4MarketHistory> {
  const cacheKey = `${deployment.chainId}:${market.underlying.address.toLowerCase()}:${window}`;
  let data = historyCache.get(cacheKey);
  if (!data) {
    data = await queryGraphqlEndpoint<AaveV4HistoryQueryData>({
      endpoint: AAVE_V4_GRAPHQL_ENDPOINT,
      name: "Aave V4 GraphQL asset history",
      query: AAVE_V4_HISTORY_QUERY,
      variables: {
        token: {
          address: market.underlying.address,
          chainId: deployment.chainId,
        },
        window,
      },
    });
    historyCache.set(cacheKey, data);
  }

  return {
    window,
    supply: hubSamples(data.assetSupplyHistory, market.hub.id),
    borrow: hubSamples(data.assetBorrowHistory, market.hub.id),
    prices: data.assetPriceHistory,
  };
}

const AAVE_V4_RESERVES_QUERY = `query AaveV4Reserves($chainIds: [ChainId!]) {
  reserves(request: { query: { chainIds: $chainIds }, filter: ALL }) {
    id
    onChainId
    chain { name chainId }
    spoke {
      id
      name
      address
      chain { name chainId }
    }
    asset {
      id
      hub {
        id
        name
        address
        chain { name chainId }
      }
      underlying {
        address
        chain { name chainId }
        info { name symbol decimals }
      }
      summary {
        supplied { amount { value decimals onChainValue } exchange { value } }
        borrowed { amount { value decimals onChainValue } exchange { value } }
        availableLiquidity { amount { value decimals onChainValue } exchange { value } }
        supplyApy { value normalized }
        borrowApy { value normalized }
        netApy { value normalized }
        utilizationRate { value normalized }
      }
      settings {
        liquidityFee { value normalized }
      }
    }
    summary {
      supplied { amount { value decimals onChainValue } exchange { value } }
      borrowed { amount { value decimals onChainValue } exchange { value } }
      suppliable { amount { value decimals onChainValue } exchange { value } }
      borrowable { amount { value decimals onChainValue } exchange { value } }
      supplyApy { value normalized }
      borrowApy { value normalized }
    }
    settings {
      collateralFactor { value normalized }
      maxLiquidationBonus { value normalized }
      liquidationFee { value normalized }
      borrowable
      collateral
      suppliable
      borrowCap { amount { value decimals onChainValue } exchange { value } }
      supplyCap { amount { value decimals onChainValue } exchange { value } }
    }
    status { frozen paused active }
    canBorrow
    canSupply
    canUseAsCollateral
  }
}`;

const AAVE_V4_HISTORY_QUERY = `query AaveV4AssetHistory($token: Erc20Input!, $window: TimeWindow!) {
  assetSupplyHistory(request: { query: { token: $token }, window: $window }) {
    date
    amount { value }
    averageApy { value normalized }
    breakdown {
      hub { id name }
      amount { value }
      apy { value normalized }
    }
  }
  assetBorrowHistory(request: { query: { token: $token }, window: $window }) {
    date
    amount { value }
    averageApy { value normalized }
    breakdown {
      hub { id name }
      amount { value }
      apy { value normalized }
    }
  }
  assetPriceHistory(request: { query: { token: $token }, window: $window }) {
    date
    price
  }
}`;

function groupHubAssetMarkets(
  reserves: AaveV4Reserve[],
): AaveV4HubAssetMarket[] {
  const byAsset = new Map<string, AaveV4HubAssetMarket>();

  for (const reserve of reserves) {
    const existing = byAsset.get(reserve.asset.id);
    if (existing) {
      existing.reserves.push(reserve);
      continue;
    }
    byAsset.set(reserve.asset.id, {
      assetId: reserve.asset.id,
      hub: reserve.asset.hub,
      underlying: reserve.asset.underlying,
      summary: reserve.asset.summary,
      settings: reserve.asset.settings,
      reserves: [reserve],
    });
  }

  return [...byAsset.values()].sort((a, b) =>
    `${a.hub.name}:${a.underlying.info.symbol}`.localeCompare(
      `${b.hub.name}:${b.underlying.info.symbol}`,
    ),
  );
}

function marketFromHubAsset(
  deployment: AaveV4Deployment,
  market: AaveV4HubAssetMarket,
): MarketDefinition {
  const token = market.underlying;
  const hubSlug = slugify(market.hub.name || market.hub.address);
  return {
    id: `${deployment.adapterId}-${deployment.chain}-${hubSlug}-${token.info.symbol.toLowerCase()}-${token.address.toLowerCase()}`,
    protocol: deployment.protocol,
    chain: deployment.chain,
    adapterId: deployment.adapterId,
    marketType: "pooled",
    assetSymbol: token.info.symbol,
    assetAddress: token.address,
    assetDecimals: token.info.decimals,
    sourceMethod: "Aave V4 GraphQL hub asset history query",
    contracts: [
      market.hub.address,
      token.address,
      ...market.reserves.map((reserve) => reserve.spoke.address),
    ],
  };
}

function normalizeHubAsset(market: AaveV4HubAssetMarket): ProtocolMarketState {
  const suppliedUsd = exchangeValue(market.summary.supplied);
  const borrowedUsd = exchangeValue(market.summary.borrowed);
  return {
    supplyApy: percentValue(market.summary.supplyApy),
    borrowApy: hasBorrowRoute(market)
      ? percentValue(market.summary.borrowApy)
      : null,
    rewardSupplyApy: null,
    rewardBorrowApy: null,
    totalSuppliedUsd: suppliedUsd,
    totalBorrowedUsd: borrowedUsd,
    availableLiquidityUsd: exchangeValue(market.summary.availableLiquidity),
    utilization: percentValue(market.summary.utilizationRate),
    ltv: maxPercent(
      market.reserves.map((reserve) => reserve.settings.collateralFactor),
    ),
    liquidationThreshold: null,
    reserveFactor: percentValue(market.settings.liquidityFee),
    supplyCapUsd: sumExchangeValues(
      market.reserves.map((reserve) => reserve.settings.supplyCap),
    ),
    borrowCapUsd: sumExchangeValues(
      market.reserves.map((reserve) => reserve.settings.borrowCap),
    ),
    isActive: isActiveMarket(market),
    isPaused: market.reserves.every((reserve) => reserve.status.paused),
  };
}

function normalizeHistoricalHubAsset(
  market: AaveV4HubAssetMarket,
  day: string,
  history: AaveV4MarketHistory | undefined,
): ProtocolMarketState | null {
  const supplySample = sampleForDay(history?.supply ?? [], day);
  const borrowSample = sampleForDay(history?.borrow ?? [], day);
  const priceSample = priceForDay(history?.prices ?? [], day);
  if (!supplySample && !borrowSample) return null;

  const priceUsd = priceSample ?? null;
  const suppliedAmount = numberOrNull(supplySample?.amount.value);
  const borrowedAmount = numberOrNull(borrowSample?.amount.value);
  const suppliedUsd =
    suppliedAmount !== null && priceUsd !== null
      ? round(suppliedAmount * priceUsd, 2)
      : null;
  const borrowedUsd =
    borrowedAmount !== null && priceUsd !== null
      ? round(borrowedAmount * priceUsd, 2)
      : null;

  return {
    supplyApy:
      supplySample?.apy === undefined ? null : percentValue(supplySample.apy),
    borrowApy:
      borrowSample?.apy === undefined || !hasBorrowRoute(market)
        ? null
        : percentValue(borrowSample.apy),
    rewardSupplyApy: null,
    rewardBorrowApy: null,
    totalSuppliedUsd: suppliedUsd,
    totalBorrowedUsd: borrowedUsd,
    availableLiquidityUsd:
      suppliedUsd === null || borrowedUsd === null
        ? null
        : round(Math.max(suppliedUsd - borrowedUsd, 0), 2),
    utilization:
      suppliedUsd && borrowedUsd !== null
        ? round((borrowedUsd / suppliedUsd) * 100, 6)
        : null,
    ltv: maxPercent(
      market.reserves.map((reserve) => reserve.settings.collateralFactor),
    ),
    liquidationThreshold: null,
    reserveFactor: percentValue(market.settings.liquidityFee),
    supplyCapUsd: null,
    borrowCapUsd: null,
    isActive: isActiveMarket(market),
    isPaused: market.reserves.every((reserve) => reserve.status.paused),
  };
}

function exchangeValue(amount: AaveV4Erc20Amount): number | null {
  const value = amount.exchange?.value;
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? round(parsed, 2) : null;
}

function sumExchangeValues(amounts: AaveV4Erc20Amount[]): number | null {
  const values = amounts
    .map(exchangeValue)
    .filter((value): value is number => value !== null && value > 0);
  if (!values.length) return null;
  return round(
    values.reduce((sum, value) => sum + value, 0),
    2,
  );
}

function percentValue(value: AaveV4PercentNumber): number | null {
  const parsed = Number(value.value);
  return Number.isFinite(parsed) ? toPercent(parsed) : null;
}

function maxPercent(values: AaveV4PercentNumber[]): number | null {
  const parsed = values
    .map(percentValue)
    .filter((value): value is number => value !== null);
  if (!parsed.length) return null;
  return Math.max(...parsed);
}

function hubSamples(
  samples: AaveV4HistorySample[],
  hubId: string,
): AaveV4HistorySample[] {
  const values: AaveV4HistorySample[] = [];
  for (const sample of samples) {
    const breakdown = sample.breakdown.find((item) => item.hub.id === hubId);
    if (!breakdown) continue;
    values.push({
      ...sample,
      amount: breakdown.amount,
      averageApy: breakdown.apy,
      breakdown: [breakdown],
    });
  }
  return values;
}

function sampleForDay(
  samples: AaveV4HistorySample[],
  day: string,
): (AaveV4HistorySample & { apy: AaveV4PercentNumber }) | undefined {
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  const sameDaySamples = samples.filter((item) => item.date.slice(0, 10) === day);
  const value = sameDaySamples.sort(
    (a, b) =>
      Math.abs(Date.parse(a.date) - dayStart) -
      Math.abs(Date.parse(b.date) - dayStart),
  )[0];
  if (!value) return undefined;
  return {
    ...value,
    apy: value.averageApy,
  };
}

function priceForDay(
  samples: AaveV4PriceSample[],
  day: string,
): number | null {
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  const sample = samples
    .filter((item) => item.date.slice(0, 10) === day)
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a.date) - dayStart) -
        Math.abs(Date.parse(b.date) - dayStart),
    )[0];
  return numberOrNull(sample?.price);
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasBorrowRoute(market: AaveV4HubAssetMarket): boolean {
  return market.reserves.some(
    (reserve) => reserve.canBorrow || reserve.settings.borrowable,
  );
}

function isActiveMarket(market: AaveV4HubAssetMarket): boolean {
  return market.reserves.some(
    (reserve) => reserve.status.active && !reserve.status.frozen,
  );
}

function historyDay(ctx: AdapterContext): string | undefined {
  const day = ctx.now.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return day < today ? day : undefined;
}

function historyWindowForDay(day: string): AaveV4HistoryWindow {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 31);
  return day >= cutoff.toISOString().slice(0, 10) ? "LAST_MONTH" : "LAST_YEAR";
}

function aaveV4HistoryStartDate(): string {
  return AAVE_V4_HISTORY_START_DATE;
 }

function deploymentForChain(chain: string): AaveV4Deployment {
  const deployment = DEPLOYMENTS.find((item) => item.chain === chain);
  if (!deployment) {
    throw new Error(`No Aave V4 deployment configured for ${chain}`);
  }
  return deployment;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export { aaveV4Adapter };
