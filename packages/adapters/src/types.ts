import type {
  AdapterContext,
  BlockRange,
  CanonicalMarketEvent,
  CanonicalMarketSnapshot,
  MarketDefinition,
  RawMarketEvent,
  RawMarketSnapshot,
} from "@stablewatch-lending/core";
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
};

export type LendingFetchError = {
  marketId?: string;
  message: string;
};

export type LendingFetchResult = {
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
  fetch(options: LendingFetchOptions): Promise<LendingFetchResult>;
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
