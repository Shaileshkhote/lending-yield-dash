export type LendingMarket = {
  marketId: string;
  protocol: string;
  protocolSlug: string;
  chain: string;
  marketType: string;
  assetSymbol: string;
  assetAddress: string;
  supplyApy: number | null;
  borrowApy: number | null;
  rewardSupplyApy: number | null;
  netSupplyApy: number | null;
  totalSuppliedUsd: number | null;
  totalBorrowedUsd: number | null;
  availableLiquidityUsd: number | null;
  utilization: number | null;
  dataQualityScore: number;
  lastUpdated: string;
  source: {
    method: string;
    payloadHash: string;
    contracts: string[];
  };
};

export type CurrentMarketsResponse = {
  generatedAt: string;
  status: string;
  data: LendingMarket[];
};

export type HistoryPoint = {
  timestamp: string;
  date?: string;
  tvlUsd?: number | null;
  apy?: number | null;
  apyBase?: number | null;
  apyReward?: number | null;
  supplyApy?: number | null;
  borrowApy?: number | null;
  rewardBorrowApy?: number | null;
  netSupplyApy?: number | null;
  totalSuppliedUsd?: number | null;
  totalBorrowedUsd?: number | null;
  availableLiquidityUsd?: number | null;
  utilization?: number | null;
  dataQualityScore?: number;
};

export type PoolChartResponse = {
  generatedAt: string;
  status: string;
  marketId: string;
  data: HistoryPoint[];
};

export type QualityCheck = {
  id: string;
  marketId: string;
  snapshotId?: string;
  checkName: string;
  status: "pass" | "warn" | "fail";
  severity: "low" | "medium" | "high";
  message: string;
  observedValue?: string;
  expectedValue?: string;
  createdAt: string;
};

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path));
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function apiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl || /^https?:\/\//.test(path)) return path;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return `${value.toFixed(2)}%`;
}

export function qualityLabel(score: number): "Healthy" | "Watch" | "Degraded" | "Unreliable" {
  if (score >= 95) return "Healthy";
  if (score >= 80) return "Watch";
  if (score >= 50) return "Degraded";
  return "Unreliable";
}
