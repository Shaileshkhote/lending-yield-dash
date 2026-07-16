import { type Address } from "viem";
import type {
  LendingAdapter,
  LendingAdapterRow,
  LendingFetchOptions,
  LendingMarketValues,
} from "../../types";
import { CHAIN } from "../../helpers/chains";
import { createLendingMarket } from "../../helpers/market";
import { publicClientFor } from "../../helpers/rpc";
import { aprPercentToApy, round, unitsToNumber } from "../../helpers/units";
import { ADAPTER_VERSION } from "../../helpers/version";

const API = process.env.FLUID_API_BASE?.replace(/\/$/, "") || "https://api.fluid.instadapp.io";
const START = "2024-01-01";
const DEPLOYMENTS = [
  [CHAIN.ETHEREUM, 1],
  [CHAIN.ARBITRUM, 42161],
  [CHAIN.BASE, 8453],
  [CHAIN.BSC, 56],
  [CHAIN.POLYGON, 137],
] as const;

const erc4626Abi = [{
  type: "function",
  name: "totalAssets",
  stateMutability: "view",
  inputs: [],
  outputs: [{ type: "uint256" }],
}] as const;

type Token = {
  address: string;
  symbol: string;
  asset: { address: string; symbol: string; decimals: number; price?: string };
  totalAssets?: string;
  supplyRate?: string;
  rewardsRate?: string;
  liquiditySupplyData?: { withdrawable?: string };
  rewards?: Array<{ rate?: string | number; type?: string }>;
};
type AprPoint = {
  liquiditySupplyApr?: string | number;
  supplyApr?: string | number;
  blocknumber?: string | number;
  timestamp?: string | number;
};

const deployments = Object.fromEntries(
  DEPLOYMENTS.map(([chain, chainId]) => [chain, { chain, chainId, start: START }]),
);
const tokenCache = new Map<number, Token[]>();
const historyCache = new Map<string, AprPoint[]>();

const fluidAdapter: LendingAdapter = {
  id: "fluid",
  protocol: "Fluid",
  version: ADAPTER_VERSION.CONTRACT_RPC_SNAPSHOT,
  adapter: Object.fromEntries(
    DEPLOYMENTS.map(([chain, chainId]) => [chain, { start: START, chainId }]),
  ),
  supportedChains: DEPLOYMENTS.map(([chain]) => chain),
  dataAvailability: {
    current: true,
    history: {
      granularity: "1d",
      startDateByChain: Object.fromEntries(DEPLOYMENTS.map(([chain]) => [chain, START])),
    },
  },

  async fetch(options: LendingFetchOptions): Promise<LendingAdapterRow[]> {
    const deployment = deploymentFor(options.chain);
    const historical = options.runMode === "daily";
    const tokens = (await tokensFor(deployment.chainId)).filter(
      (token) => !options.assets?.length || options.assets.includes(token.asset.symbol.toLowerCase()),
    );
    const rows: Array<LendingAdapterRow | null> = await Promise.all(tokens.map(async (token) => {
      const point = historical ? await aprPointFor(deployment.chainId, token, options) : null;
      if (historical && !point) return null;

      const blockNumber = number(point?.blocknumber) ?? options.blockNumber ?? options.blockNumbers?.[options.chain] ?? 0;
      const totalAssets = historical && point
        ? await totalAssetsAt(token, options, BigInt(blockNumber)).catch(() => tokenTotalAssets(token))
        : tokenTotalAssets(token);

      return {
        market: createLendingMarket({
          id: `fluid-${options.chain}-${token.asset.symbol.toLowerCase()}-${token.asset.address.toLowerCase()}`,
          protocol: "Fluid",
          chain: options.chain,
          adapterId: "fluid",
          marketType: "pooled",
          assetSymbol: token.asset.symbol,
          assetAddress: token.asset.address,
          assetDecimals: token.asset.decimals,
          sourceMethod: "Fluid fToken API, APR history API, and ERC4626 totalAssets",
          contracts: [token.address, token.asset.address],
        }),
        values: values({
          token,
          totalAssets,
          withdrawable: historical ? null : tokenAmount(token.liquiditySupplyData?.withdrawable, token.asset.decimals),
          baseApr: pct(point?.liquiditySupplyApr ?? token.supplyRate),
          netApr: pct(point?.supplyApr ?? token.supplyRate),
          rewardApr: historical ? 0 : rewardApr(token),
        }),
        raw: { token, aprPoint: point },
        blockNumber,
        source: {
          source: {
            kind: historical ? "api+rpc" : "api",
            endpoint: historical && point ? historyUrl(deployment.chainId, token, options) : tokensUrl(deployment.chainId),
            chainId: deployment.chainId,
            mode: historical ? "historical-day" : "latest",
            fToken: token.address,
          },
          fluidApi: { endpoint: tokensUrl(deployment.chainId), chainId: deployment.chainId },
        },
      } satisfies LendingAdapterRow;
    }));

    return rows.filter((row): row is LendingAdapterRow => row !== null);
  },
};

async function tokensFor(chainId: number): Promise<Token[]> {
  const cached = tokenCache.get(chainId);
  if (cached) return cached;
  const data = await fluidGet<{ data?: Token[] } | Token[]>(tokensUrl(chainId));
  const tokens = Array.isArray(data) ? data : data.data ?? [];
  tokenCache.set(chainId, tokens);
  return tokens;
}

async function aprPointFor(chainId: number, token: Token, options: LendingFetchOptions): Promise<AprPoint | null> {
  if (options.startTimestamp === undefined || options.endTimestamp === undefined) {
    throw new Error("Fluid APR history requires a date window");
  }
  const key = `${chainId}:${token.address}:${options.startTimestamp}:${options.endTimestamp}`;
  const points = historyCache.get(key) ?? await fluidGet<AprPoint[]>(historyUrl(chainId, token, options));
  historyCache.set(key, points);
  return points
    .filter((point) => Number(point.timestamp ?? 0) <= options.endTimestamp!)
    .sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0))
    .at(-1) ?? null;
}

async function totalAssetsAt(token: Token, options: LendingFetchOptions, blockNumber: bigint): Promise<number> {
  const raw = await publicClientFor(options, options.chain).readContract({
    address: token.address as Address,
    abi: erc4626Abi,
    functionName: "totalAssets",
    blockNumber,
  });
  return unitsToNumber(raw, token.asset.decimals);
}

function values(args: {
  token: Token;
  totalAssets: number;
  withdrawable: number | null;
  baseApr: number | null;
  netApr: number | null;
  rewardApr: number;
}): LendingMarketValues {
  const price = number(args.token.asset.price) ?? 0;
  const supplyApy = args.baseApr === null ? null : aprPercentToApy(args.baseApr);
  const rateRewardApy = supplyApy === null || args.netApr === null
    ? 0
    : Math.max(aprPercentToApy(args.netApr) - supplyApy, 0);
  const explicitRewardApy = args.rewardApr > 0 ? aprPercentToApy(args.rewardApr) : 0;
  const rewardSupplyApy = rateRewardApy + explicitRewardApy > 0
    ? round(rateRewardApy + explicitRewardApy, 6)
    : null;
  const suppliedUsd = args.totalAssets * price;
  const borrowedUsd = args.withdrawable === null
    ? null
    : Math.max(args.totalAssets - args.withdrawable, 0) * price;

  return {
    supplyApy,
    borrowApy: null,
    rewardSupplyApy,
    rewardBorrowApy: null,
    netSupplyApy: supplyApy === null ? null : round(supplyApy + (rewardSupplyApy ?? 0), 6),
    totalSuppliedUsd: round(suppliedUsd, 2),
    totalBorrowedUsd: borrowedUsd === null ? null : round(borrowedUsd, 2),
    availableLiquidityUsd: args.withdrawable === null ? null : round(args.withdrawable * price, 2),
    utilization: suppliedUsd > 0 && borrowedUsd !== null ? round((borrowedUsd / suppliedUsd) * 100, 6) : null,
    isActive: true,
    isPaused: false,
  };
}

function rewardApr(token: Token): number {
  const native = (number(token.rewardsRate) ?? 0) / 1e12;
  const merkl = (token.rewards ?? [])
    .filter((reward) => !reward.type || reward.type === "supply")
    .reduce((sum, reward) => sum + (pct(reward.rate) ?? 0), 0);
  return round(native + merkl, 6);
}

function tokenTotalAssets(token: Token): number {
  return tokenAmount(token.totalAssets, token.asset.decimals);
}

function tokenAmount(value: string | undefined, decimals: number): number {
  return unitsToNumber(BigInt(value ?? 0), decimals);
}

async function fluidGet<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Fluid API ${url} failed with ${response.status}`);
  return response.json() as Promise<T>;
}

function tokensUrl(chainId: number): string {
  return `${API}/v2/lending/${chainId}/tokens`;
}

function historyUrl(chainId: number, token: Token, options: LendingFetchOptions): string {
  const url = new URL(`${API}/${chainId}/fluid-tokens/${token.address}/apr-history`);
  url.searchParams.set("start", new Date(options.startTimestamp! * 1000).toISOString());
  url.searchParams.set("end", new Date(options.endTimestamp! * 1000).toISOString());
  return url.toString();
}

function deploymentFor(chain: string): { chain: string; chainId: number; start: string } {
  const deployment = deployments[chain];
  if (!deployment) throw new Error(`No Fluid deployment configured for ${chain}`);
  return deployment;
}

function pct(value: string | number | undefined): number | null {
  const parsed = number(value);
  return parsed === null ? null : round(parsed / 100, 6);
}

function number(value: string | number | bigint | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export { fluidAdapter };
