import { getProtocolLinksForSlug, type ProtocolPoolLinks } from "@lendingscope/protocol-data";

export type LendingMarket = {
  marketId: string;
  protocol: string;
  protocolSlug: string;
  chain: string;
  marketType: string;
  assetSymbol: string;
  assetAddress: string;
  supplyApy: number | null;
  sevenDayApy?: number | null;
  apySevenDayChange?: number | null;
  thirtyDayApy?: number | null;
  borrowApy: number | null;
  rewardSupplyApy: number | null;
  rewardBorrowApy?: number | null;
  netSupplyApy: number | null;
  totalSuppliedUsd: number | null;
  totalBorrowedUsd: number | null;
  availableLiquidityUsd: number | null;
  utilization: number | null;
  isActive?: boolean;
  isPaused?: boolean;
  dataQualityScore: number;
  lastUpdated: string;
  source?: {
    method: string;
    payloadHash: string;
    contracts: string[];
  };
};

export type MarketHealth = {
  label: "Healthy" | "Syncing" | "Degraded" | "Incomplete" | "Inactive" | "Paused" | "Collateral Only";
  tone: "healthy" | "syncing" | "degraded" | "incomplete" | "inactive" | "paused" | "collateral";
  reason: string;
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

export async function fetchJson<T>(path: string): Promise<T> {
  const url = apiUrl(path);
  const response = await fetch(url, { cache: "no-store" });
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

export function formatSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function marketHealth(market: LendingMarket): MarketHealth {
  const updatedAt = Date.parse(market.lastUpdated);
  if (!Number.isFinite(updatedAt)) {
    return { label: "Incomplete", tone: "incomplete", reason: "Missing update timestamp" };
  }

  const ageHours = (Date.now() - updatedAt) / 36e5;
  const updatedToday = new Date(updatedAt).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  const score = market.dataQualityScore ?? 0;
  const apy = market.netSupplyApy ?? market.supplyApy;
  const borrowable = market.borrowApy !== null && market.borrowApy !== undefined;

  if (ageHours > 48) {
    return { label: "Syncing", tone: "syncing", reason: `Last update is ${Math.floor(ageHours / 24)}d old` };
  }
  if (!updatedToday) {
    return { label: "Syncing", tone: "syncing", reason: "Latest daily snapshot is still syncing" };
  }
  if (market.isActive === false) {
    return { label: "Inactive", tone: "inactive", reason: "Protocol marks this market inactive" };
  }
  if (market.isPaused) {
    return { label: "Paused", tone: "paused", reason: "Protocol marks this market paused" };
  }
  if (!borrowable) {
    return { label: "Collateral Only", tone: "collateral", reason: "Borrowing is not enabled for this market" };
  }
  if (apy === null || apy === undefined || market.totalSuppliedUsd === null || market.totalBorrowedUsd === null || market.utilization === null) {
    return { label: "Incomplete", tone: "incomplete", reason: "Required APY or market-size fields are missing" };
  }
  if (score < 50) {
    return { label: "Incomplete", tone: "incomplete", reason: "Quality score is below 50" };
  }
  if (score < 80) {
    return { label: "Degraded", tone: "degraded", reason: "Current data is available but has quality warnings" };
  }
  return { label: "Healthy", tone: "healthy", reason: "Current through today with clean checks" };
}

export function poolLinks(market: LendingMarket): { app: string; docs: string } {
  const chain = market.chain.toLowerCase();
  const fallback = `https://etherscan.io/token/${market.assetAddress}`;
  const protocolLinks = getProtocolLinksForSlug(market.protocolSlug);
  const app = buildPoolAppLink(market, protocolLinks?.poolLinks, chain) ?? protocolLinks?.app ?? protocolLinks?.website ?? fallback;
  const docs = protocolLinks?.poolLinks?.docs ?? protocolLinks?.docs ?? protocolLinks?.website ?? fallback;
  return {
    app,
    docs,
  };
}

function buildPoolAppLink(market: LendingMarket, links: ProtocolPoolLinks | undefined, chain: string): string | undefined {
  if (!links?.app) return undefined;
  return renderPoolTemplate(links.app, {
    assetAddress: market.assetAddress,
    chain,
    chainId: links.chainIds?.[chain],
    marketId: market.marketId,
    marketIdHex64: market.marketId.match(/0x[a-f0-9]{64}$/i)?.[0],
    marketName: links.marketNames?.[chain] ?? renderPoolTemplate(links.marketNameTemplate, { chain }),
  }) ?? links.fallbackApp;
}

function renderPoolTemplate(template: string | undefined, values: Record<string, string | number | undefined>): string | undefined {
  if (!template) return undefined;
  let hasMissingValue = false;
  const rendered = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === "") {
      hasMissingValue = true;
      return "";
    }
    return encodeURIComponent(String(value));
  });
  return hasMissingValue ? undefined : rendered;
}
