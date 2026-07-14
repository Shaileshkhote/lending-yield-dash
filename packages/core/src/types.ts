import { z } from "zod";

export type MarketType = "pooled" | "isolated" | "vault" | "comet";
export type QualityStatus = "pass" | "warn" | "fail";
export type QualitySeverity = "low" | "medium" | "high";

export const canonicalMarketSnapshotSchema = z.object({
  timestamp: z.string(),
  blockNumber: z.number().int().nonnegative(),
  protocol: z.string(),
  adapterId: z.string(),
  chain: z.string(),
  marketId: z.string(),
  marketType: z.enum(["pooled", "isolated", "vault", "comet"]),
  assetSymbol: z.string(),
  assetAddress: z.string(),
  supplyApy: z.number().nullable(),
  borrowApy: z.number().nullable(),
  rewardSupplyApy: z.number().nullable(),
  rewardBorrowApy: z.number().nullable(),
  netSupplyApy: z.number().nullable(),
  totalSuppliedUsd: z.number().nullable(),
  totalBorrowedUsd: z.number().nullable(),
  availableLiquidityUsd: z.number().nullable(),
  utilization: z.number().nullable(),
  ltv: z.number().nullable(),
  liquidationThreshold: z.number().nullable(),
  reserveFactor: z.number().nullable(),
  supplyCapUsd: z.number().nullable(),
  borrowCapUsd: z.number().nullable(),
  isActive: z.boolean(),
  isPaused: z.boolean(),
  dataQualityScore: z.number().min(0).max(100).default(100),
  source: z.object({
    rawSnapshotId: z.string().optional(),
    payloadHash: z.string(),
    method: z.string(),
    contracts: z.array(z.string())
  })
});

export type CanonicalMarketSnapshot = z.infer<typeof canonicalMarketSnapshotSchema>;

export type MarketDefinition = {
  id: string;
  protocol: string;
  chain: string;
  adapterId: string;
  marketType: MarketType;
  assetSymbol: string;
  assetAddress: string;
  assetDecimals: number;
  sourceMethod: string;
  contracts: string[];
};

export type RawMarketSnapshot = {
  runId: string;
  adapterId: string;
  protocol: string;
  chain: string;
  marketId: string;
  blockNumber: number;
  sourceMethod: string;
  contracts: string[];
  collectedAt: string;
  payloadHash: string;
  payload: Record<string, unknown>;
};

export type RawMarketEvent = {
  marketId: string;
  chain: string;
  protocol: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  eventName: string;
  payload: Record<string, unknown>;
};

export type CanonicalMarketEvent = {
  marketId: string;
  chain: string;
  protocol: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  eventType: "supply" | "withdraw" | "borrow" | "repay" | "liquidation" | "interest_update";
  amountUsd: number | null;
  timestamp: string;
};

export type BlockRange = {
  fromBlock: number;
  toBlock: number;
};

export type AdapterContext = {
  runId: string;
  now: Date;
  rpcUrls?: Record<string, string | undefined>;
  blockNumbers?: Record<string, bigint | undefined>;
  chains?: string[];
  assets?: string[];
  sourceMode?: "auto" | "api" | "graphql" | "rpc" | "dune";
};

export type QualityCheckResult = {
  marketId: string;
  snapshotId?: string;
  checkName: string;
  status: QualityStatus;
  severity: QualitySeverity;
  message: string;
  observedValue?: string;
  expectedValue?: string;
};
