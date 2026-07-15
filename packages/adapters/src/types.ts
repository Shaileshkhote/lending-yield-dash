import type {
  AdapterContext,
  BlockRange,
  CanonicalMarketEvent,
  CanonicalMarketSnapshot,
  MarketDefinition,
  MarketType,
  RawMarketEvent,
  RawMarketSnapshot,
} from "@lendingscope/core";
import type { AdapterVersion } from "./helpers/version";

export type LendingChainConfig = {
  start?: string;
  [key: string]: unknown;
};

export type AdapterDataAvailability = {
  current: boolean;
  history?: {
    granularity: "1d";
    startDateByChain: Record<string, string>;
  };
};

export type LendingFetchOptions = AdapterContext & {
  chain: string;
  blockNumber?: bigint;
  runMode?: "latest" | "daily" | "hourly";
  startTimestamp?: number;
  endTimestamp?: number;
  startOfDay?: number;
  dateString?: string;
  startOfDayId?: string;
  getBlockForTimestamp?: (timestamp: number) => Promise<bigint | undefined>;
  getStartBlock?: () => Promise<bigint | undefined>;
  getEndBlock?: () => Promise<bigint | undefined>;
};

export type LendingFetchError = {
  marketId?: string;
  message: string;
};

export type LendingMarketValues = {
  supplyApy: number | null;
  borrowApy: number | null;
  rewardSupplyApy?: number | null;
  rewardBorrowApy?: number | null;
  netSupplyApy?: number | null;
  totalSuppliedUsd: number | null;
  totalBorrowedUsd: number | null;
  availableLiquidityUsd: number | null;
  utilization: number | null;
  ltv?: number | null;
  liquidationThreshold?: number | null;
  reserveFactor?: number | null;
  supplyCapUsd?: number | null;
  borrowCapUsd?: number | null;
  isActive?: boolean;
  isPaused?: boolean;
  isBorrowable?: boolean;
};

export type LendingAdapterMarket = {
  id?: string;
  protocol: string;
  chain: string;
  adapterId: string;
  marketType: MarketType;
  assetSymbol: string;
  assetAddress: string;
  assetDecimals: number;
  sourceMethod: string;
  contracts?: string[];
};

export type LendingAdapterRow = {
  market: MarketDefinition | LendingAdapterMarket;
  values: LendingMarketValues;
  raw?: unknown;
  blockNumber?: number | bigint;
  source?: Record<string, unknown>;
};

export type LendingSnapshotResult = {
  markets: MarketDefinition[];
  rawPayloads: RawMarketSnapshot[];
  snapshots: CanonicalMarketSnapshot[];
  errors?: LendingFetchError[];
};

export interface LendingAdapter {
  id: string;
  protocol: string;
  version: AdapterVersion;
  adapter: Record<string, LendingChainConfig>;
  supportedChains: string[];
  dataAvailability: AdapterDataAvailability;
  fetch(options: LendingFetchOptions): Promise<LendingAdapterRow[]>;
  backfillEvents?(
    market: MarketDefinition,
    range: BlockRange,
    ctx: AdapterContext,
  ): Promise<RawMarketEvent[]>;
  normalizeEvent?(
    event: RawMarketEvent,
    ctx: AdapterContext,
  ): Promise<CanonicalMarketEvent>;
}
