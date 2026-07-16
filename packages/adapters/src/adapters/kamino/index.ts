import type { MarketDefinition } from "@lendingscope/core";
import type {
  LendingAdapter,
  LendingAdapterRow,
  LendingChainConfig,
  LendingFetchOptions,
  LendingMarketValues,
} from "../../types";
import { createLendingMarket } from "../../helpers/market";
import { round, toPercent } from "../../helpers/units";
import { ADAPTER_VERSION } from "../../helpers/version";

const KAMINO_API_BASE =
  process.env.KAMINO_API_BASE?.trim() || "https://api.kamino.finance";
const SOLANA_CHAIN = "solana";
const START_DATE = "2023-10-12";
const SOURCE_METHOD = "Kamino official REST API";
const MARKET_CONCURRENCY = envPositiveInt("KAMINO_API_MARKET_CONCURRENCY", 2);
const RESERVE_CONCURRENCY = envPositiveInt("KAMINO_API_RESERVE_CONCURRENCY", 2);

const chainConfig: Record<string, LendingChainConfig> = {
  [SOLANA_CHAIN]: {
    start: START_DATE,
  },
};

const marketsCache = new Map<string, KaminoMarketConfig[]>();
const reserveMetricsCache = new Map<string, KaminoReserveMetric[]>();
const reserveHistoryCache = new Map<string, KaminoReserveHistoryPoint | null>();

const kaminoAdapter: LendingAdapter = {
  id: "kamino",
  protocol: "Kamino",
  version: ADAPTER_VERSION.OFFICIAL_API_SNAPSHOT,
  adapter: chainConfig,
  supportedChains: [SOLANA_CHAIN],
  dataAvailability: {
    current: true,
    history: {
      granularity: "1d",
      startDateByChain: {
        [SOLANA_CHAIN]: START_DATE,
      },
    },
  },

  async fetch(options: LendingFetchOptions): Promise<LendingAdapterRow[]> {
    if (options.chain !== SOLANA_CHAIN) {
      throw new Error(`Kamino adapter only supports ${SOLANA_CHAIN}`);
    }

    const marketConfigs = await loadMarketConfigs();
    const rows = await mapWithConcurrency(
      marketConfigs,
      MARKET_CONCURRENCY,
      async (config) => loadRowsForMarket(config, options),
    );
    return rows.flat();
  },
};

async function loadRowsForMarket(
  config: KaminoMarketConfig,
  options: LendingFetchOptions,
): Promise<LendingAdapterRow[]> {
  const metrics = await loadReserveMetrics(config.lendingMarket);
  const rows: Array<LendingAdapterRow | undefined> = await mapWithConcurrency(
    metrics,
    RESERVE_CONCURRENCY,
    async (metric) => {
    if (
      options.assets?.length &&
      !options.assets.includes(metric.liquidityToken.toLowerCase())
    ) {
      return undefined;
    }

    const historyPoint = await loadReserveHistoryPoint(
      config.lendingMarket,
      metric.reserve,
      options,
    );

    if (options.runMode === "daily" && !historyPoint) {
      return undefined;
    }

    const market = marketFromRecord(config, metric, historyPoint);
    return {
      market,
      blockNumber: 0,
      values: normalizeMarket(metric, historyPoint, options),
      raw: {
        market: config,
        reserveMetric: metric,
        reserveHistory: historyPoint,
      },
      source: apiSource({
        mode: options.runMode === "daily" ? "historical-day" : "latest",
        marketPubkey: config.lendingMarket,
        reservePubkey: metric.reserve,
        date: options.runMode === "daily" ? options.dateString : undefined,
      }),
    } satisfies LendingAdapterRow;
    },
  );

  return rows.filter((row): row is LendingAdapterRow => Boolean(row));
}

async function loadMarketConfigs(): Promise<KaminoMarketConfig[]> {
  const cacheKey = "markets";
  const cached = marketsCache.get(cacheKey);
  if (cached) return cached;

  const markets = await fetchJson<KaminoMarketConfig[]>("/v2/kamino-market");
  const uniqueMarkets = markets.filter(
    (market, index, all) =>
      market.lendingMarket &&
      all.findIndex((item) => item.lendingMarket === market.lendingMarket) ===
        index,
  );
  marketsCache.set(cacheKey, uniqueMarkets);
  return uniqueMarkets;
}

async function loadReserveMetrics(
  marketPubkey: string,
): Promise<KaminoReserveMetric[]> {
  const cached = reserveMetricsCache.get(marketPubkey);
  if (cached) return cached;

  const metrics = await fetchJson<KaminoReserveMetric[]>(
    `/kamino-market/${marketPubkey}/reserves/metrics`,
  );
  reserveMetricsCache.set(marketPubkey, metrics);
  return metrics;
}

async function loadReserveHistoryPoint(
  marketPubkey: string,
  reservePubkey: string,
  options: LendingFetchOptions,
): Promise<KaminoReserveHistoryPoint | null> {
  const { start, end, cacheDay } = historyWindow(options);
  const cacheKey = `${marketPubkey}:${reservePubkey}:${cacheDay}`;
  if (reserveHistoryCache.has(cacheKey)) {
    return reserveHistoryCache.get(cacheKey) ?? null;
  }

  const response = await fetchJson<KaminoReserveHistoryResponse>(
    `/kamino-market/${marketPubkey}/reserves/${reservePubkey}/metrics/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&frequency=day`,
  );
  const point = response.history?.[0] ?? null;
  reserveHistoryCache.set(cacheKey, point);
  return point;
}

function historyWindow(options: LendingFetchOptions): {
  start: string;
  end: string;
  cacheDay: string;
} {
  if (options.runMode === "daily" && options.dateString) {
    return {
      start: `${options.dateString}T00:00:00.000Z`,
      end: `${nextUtcDate(options.dateString)}T00:00:00.000Z`,
      cacheDay: options.dateString,
    };
  }

  const endDate = options.now.toISOString().slice(0, 10);
  const startDate = previousUtcDate(endDate);
  return {
    start: `${startDate}T00:00:00.000Z`,
    end: `${endDate}T00:00:00.000Z`,
    cacheDay: startDate,
  };
}

function marketFromRecord(
  config: KaminoMarketConfig,
  metric: KaminoReserveMetric,
  historyPoint: KaminoReserveHistoryPoint | null,
): MarketDefinition {
  const symbol = historyPoint?.metrics.symbol ?? metric.liquidityToken;
  return createLendingMarket({
    id: `kamino-solana-${slug(config.name)}-${symbol.toLowerCase()}-${metric.reserve.toLowerCase()}`,
    protocol: "Kamino",
    chain: SOLANA_CHAIN,
    adapterId: "kamino",
    marketType: config.isPrimary ? "pooled" : "isolated",
    assetSymbol: symbol,
    assetAddress: metric.liquidityTokenMint,
    assetDecimals: historyPoint?.metrics.decimals ?? 0,
    sourceMethod: SOURCE_METHOD,
    contracts: [config.lendingMarket, metric.reserve, metric.liquidityTokenMint],
  });
}

function normalizeMarket(
  metric: KaminoReserveMetric,
  historyPoint: KaminoReserveHistoryPoint | null,
  options: LendingFetchOptions,
): LendingMarketValues {
  const history = historyPoint?.metrics;
  const suppliedUsd =
    options.runMode === "daily"
      ? numberOrNull(history?.depositTvl)
      : numberOrNull(metric.totalSupplyUsd);
  const borrowedUsd =
    options.runMode === "daily"
      ? numberOrNull(history?.borrowTvl)
      : numberOrNull(metric.totalBorrowUsd);
  const depositLimit = capToUsd(
    history?.reserveDepositLimit,
    history?.decimals,
    numberOrNull(history?.assetPriceUSD),
  );
  const borrowLimit = capToUsd(
    history?.reserveBorrowLimit,
    history?.decimals,
    numberOrNull(history?.assetPriceUSD),
  );
  const status = history?.status;

  return {
    supplyApy:
      options.runMode === "daily"
        ? percentFromFraction(history?.supplyInterestAPY)
        : percentFromFraction(metric.supplyApy),
    borrowApy:
      options.runMode === "daily"
        ? percentFromFraction(history?.borrowInterestAPY)
        : percentFromFraction(metric.borrowApy),
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
    ltv:
      options.runMode === "daily"
        ? percentFromFraction(history?.loanToValuePct)
        : percentFromFraction(metric.maxLtv),
    liquidationThreshold: percentFromFraction(history?.liquidationThreshold),
    reserveFactor: percentFromFraction(history?.protocolTakeRate),
    supplyCapUsd: depositLimit,
    borrowCapUsd: borrowLimit,
    isActive: status ? status.toLowerCase() === "active" : true,
    isPaused: status ? status.toLowerCase() !== "active" : false,
    isBorrowable: borrowLimit === null ? true : borrowLimit > 0,
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${KAMINO_API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(
      `Kamino API ${path} failed with ${response.status} ${response.statusText}`,
    );
  }
  return response.json() as Promise<T>;
}

function apiSource(args: {
  mode: string;
  marketPubkey: string;
  reservePubkey: string;
  date?: string;
}): Record<string, unknown> {
  const detail = {
    kind: "api",
    endpoint: KAMINO_API_BASE,
    mode: args.mode,
    marketPubkey: args.marketPubkey,
    reservePubkey: args.reservePubkey,
    date: args.date,
  };
  return {
    source: detail,
    kamino: detail,
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function capToUsd(
  rawCap: string | undefined,
  decimals: number | undefined,
  priceUsd: number | null,
): number | null {
  if (!rawCap || decimals === undefined || priceUsd === null) return null;
  const parsed = Number(rawCap);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return round((parsed / 10 ** decimals) * priceUsd, 2);
}

function percentFromFraction(value: string | number | undefined): number | null {
  const parsed = numberOrNull(value);
  return parsed === null ? null : toPercent(parsed);
}

function numberOrNull(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nextUtcDate(date: string): string {
  return shiftUtcDate(date, 1);
}

function previousUtcDate(date: string): string {
  return shiftUtcDate(date, -1);
}

function shiftUtcDate(date: string, days: number): string {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(timestamp + days * 86_400_000).toISOString().slice(0, 10);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function envPositiveInt(key: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type KaminoMarketConfig = {
  name: string;
  description?: string;
  lendingMarket: string;
  lookupTable?: string;
  isPrimary: boolean;
  isCurated?: boolean;
};

type KaminoReserveMetric = {
  reserve: string;
  liquidityToken: string;
  liquidityTokenMint: string;
  maxLtv: string;
  borrowApy: string;
  supplyApy: string;
  totalSupply: string;
  totalBorrow: string;
  totalBorrowUsd: string;
  totalSupplyUsd: string;
};

type KaminoReserveHistoryResponse = {
  reserve: string;
  history: KaminoReserveHistoryPoint[];
};

type KaminoReserveHistoryPoint = {
  timestamp: string;
  metrics: {
    status?: string;
    symbol?: string;
    decimals?: number;
    borrowTvl?: string;
    depositTvl?: string;
    assetPriceUSD?: string;
    loanToValuePct?: number;
    protocolTakeRate?: number;
    utilizationRatio?: number;
    borrowInterestAPY?: number;
    supplyInterestAPY?: number;
    liquidationThreshold?: number;
    reserveBorrowLimit?: string;
    reserveDepositLimit?: string;
  };
};

export { kaminoAdapter };
