import type { MarketDefinition } from "@lendingscope/core";
import type {
  LendingAdapter,
  LendingAdapterRow,
  LendingChainConfig,
  LendingFetchOptions,
  LendingMarketValues,
} from "../../types";
import { CHAIN } from "../../helpers/chains";
import { queryGraphqlEndpoint } from "../../helpers/graphql";
import { createLendingMarket } from "../../helpers/market";
import { graphqlSource } from "../../helpers/source";
import { round, toPercent } from "../../helpers/units";
import { ADAPTER_VERSION } from "../../helpers/version";

const AAVE_V4_GRAPHQL_ENDPOINT =
  process.env.AAVE_V4_GRAPHQL_ENDPOINT?.trim() ||
  "https://api.v4.aave.com/graphql";
const AAVE_V4_HISTORY_START_DATE =
  process.env.AAVE_V4_HISTORY_START_DATE?.trim() || "2026-03-30";

const DEPLOYMENTS = [
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

const reserveCache = new Map<string, any[]>();
const historyCache = new Map<string, any>();

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

  async fetch(options: LendingFetchOptions): Promise<LendingAdapterRow[]> {
    const deployment = deploymentForChain(options.chain);
    const marketsForChain = groupHubAssetMarkets(
      await loadReserves(deployment, options),
    );
    const historyDayValue = historyDay(options);
    const historyWindow = historyDayValue
      ? historyWindowForDay(historyDayValue)
      : undefined;
    const rows: LendingAdapterRow[] = [];

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

      if (!reserve) continue;

      rows.push({
        market,
        blockNumber: Number(options.blockNumber ?? 0n),
        values: reserve,
        raw: hubAsset,
        source: graphqlSource({
          alias: "aaveV4Graphql",
          endpoint: AAVE_V4_GRAPHQL_ENDPOINT,
          chainId: deployment.chainId,
          mode: historyDayValue ? "historical-history" : "latest",
          extra: {
            hubId: hubAsset.hub.id,
            hubAddress: hubAsset.hub.address,
            assetId: hubAsset.assetId,
            historyDay: historyDayValue,
            historyWindow,
          },
        }),
      });
    }

    return rows;
  },
};

async function loadReserves(
  deployment: any,
  ctx: LendingFetchOptions,
): Promise<any[]> {
  const cacheKey = `${deployment.chainId}:${ctx.assets?.join(",") ?? "all"}`;
  const cached = reserveCache.get(cacheKey);
  if (cached) return cached;

  const data = await queryGraphqlEndpoint<any>({
    endpoint: AAVE_V4_GRAPHQL_ENDPOINT,
    name: "Aave V4 GraphQL reserves",
    query: AAVE_V4_RESERVES_QUERY,
    variables: { chainIds: [deployment.chainId] },
  });

  reserveCache.set(cacheKey, data.reserves);
  return data.reserves;
}

async function loadMarketHistory(
  deployment: any,
  market: any,
  window: string,
): Promise<any> {
  const cacheKey = `${deployment.chainId}:${market.underlying.address.toLowerCase()}:${window}`;
  let data = historyCache.get(cacheKey);
  if (!data) {
    data = await queryGraphqlEndpoint<any>({
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

function groupHubAssetMarkets(reserves: any[]): any[] {
  const byAsset = new Map<string, any>();

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
  deployment: any,
  market: any,
): MarketDefinition {
  const token = market.underlying;
  const hubSlug = slugify(market.hub.name || market.hub.address);
  return createLendingMarket({
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
      ...market.reserves.map((reserve: any) => reserve.spoke.address),
    ],
  });
}

function normalizeHubAsset(market: any): LendingMarketValues {
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
      market.reserves.map((reserve: any) => reserve.settings.collateralFactor),
    ),
    liquidationThreshold: null,
    reserveFactor: percentValue(market.settings.liquidityFee),
    supplyCapUsd: sumExchangeValues(
      market.reserves.map((reserve: any) => reserve.settings.supplyCap),
    ),
    borrowCapUsd: sumExchangeValues(
      market.reserves.map((reserve: any) => reserve.settings.borrowCap),
    ),
    isActive: isActiveMarket(market),
    isPaused: market.reserves.every((reserve: any) => reserve.status.paused),
  };
}

function normalizeHistoricalHubAsset(
  market: any,
  day: string,
  history: any,
): LendingMarketValues | null {
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
      market.reserves.map((reserve: any) => reserve.settings.collateralFactor),
    ),
    liquidationThreshold: null,
    reserveFactor: percentValue(market.settings.liquidityFee),
    supplyCapUsd: null,
    borrowCapUsd: null,
    isActive: isActiveMarket(market),
    isPaused: market.reserves.every((reserve: any) => reserve.status.paused),
  };
}

function exchangeValue(amount: any): number | null {
  const value = amount.exchange?.value;
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? round(parsed, 2) : null;
}

function sumExchangeValues(amounts: any[]): number | null {
  const values = amounts
    .map(exchangeValue)
    .filter((value): value is number => value !== null && value > 0);
  if (!values.length) return null;
  return round(
    values.reduce((sum, value) => sum + value, 0),
    2,
  );
}

function percentValue(value: any): number | null {
  const parsed = Number(value.value);
  return Number.isFinite(parsed) ? toPercent(parsed) : null;
}

function maxPercent(values: any[]): number | null {
  const parsed = values
    .map(percentValue)
    .filter((value): value is number => value !== null);
  if (!parsed.length) return null;
  return Math.max(...parsed);
}

function hubSamples(samples: any[], hubId: string): any[] {
  const values: any[] = [];
  for (const sample of samples) {
    const breakdown = sample.breakdown.find((item: any) => item.hub.id === hubId);
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
  samples: any[],
  day: string,
): any | undefined {
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

function priceForDay(samples: any[], day: string): number | null {
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

function hasBorrowRoute(market: any): boolean {
  return market.reserves.some(
    (reserve: any) => reserve.canBorrow || reserve.settings.borrowable,
  );
}

function isActiveMarket(market: any): boolean {
  return market.reserves.some(
    (reserve: any) => reserve.status.active && !reserve.status.frozen,
  );
}

function historyDay(ctx: LendingFetchOptions): string | undefined {
  return ctx.runMode === "daily" ? ctx.dateString : undefined;
}

function historyWindowForDay(day: string): string {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 31);
  return day >= cutoff.toISOString().slice(0, 10) ? "LAST_MONTH" : "LAST_YEAR";
}

function aaveV4HistoryStartDate(): string {
  return AAVE_V4_HISTORY_START_DATE;
 }

function deploymentForChain(chain: string): any {
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
