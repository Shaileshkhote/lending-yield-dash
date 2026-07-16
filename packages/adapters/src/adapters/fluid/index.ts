import { parseAbi, type Address } from "viem";
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
const ZERO = "0x0000000000000000000000000000000000000000";
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const WRAPPED_NATIVE: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  [CHAIN.ARBITRUM]: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  [CHAIN.BASE]: "0x4200000000000000000000000000000000000006",
  [CHAIN.POLYGON]: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
};

const DEPLOYMENTS = [
  [CHAIN.ETHEREUM, 1, "0xC215485C572365AE87f908ad35233EC2572A3BEC", "0x814c8C7ceb1411B364c2940c4b9380e739e06686"],
  [CHAIN.ARBITRUM, 42161, "0xdF4d3272FfAE8036d9a2E1626Df2Db5863b4b302", "0xD7D455d387d7840F56C65Bb08aD639DE9244E463"],
  [CHAIN.BASE, 8453, "0x3aF6FBEc4a2FE517F56E402C65e3f4c3e18C1D86", "0x79B3102173EB84E6BCa182C7440AfCa5A41aBcF8"],
  [CHAIN.POLYGON, 137, "0x8e72291D5e6f4AAB552cc827fB857a931Fc5CAC1", "0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC"],
  [CHAIN.BSC, 56, undefined, undefined],
] as const;

const fTokenResolverAbi = parseAbi([
  "function getFTokensEntireData() view returns ((address,bool,bool,string,string,uint256,address,uint256,uint256,uint256,uint256,uint256,uint256,int256,(bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))[])",
]);
const vaultResolverAbi = parseAbi([
  "function getVaultsEntireData() view returns ((address,bool,bool,(address,address,address,address,address,address,address,address,(address,address),(address,address),uint256,uint256,bytes32,bytes32,bytes32,bytes32),(uint16,uint16,uint16,uint16,uint16,uint16,uint16,uint16,address,uint256,uint256,address,uint256),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,int256,int256,int256,int256),(uint256,uint256,uint256,uint256,uint256,uint256),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),(uint256,int256,uint256,uint256,uint256,uint256,(uint256,int256,uint256,uint256,uint256,uint256,int256)),(bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),(bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))[])",
  "function getVaultsEntireData(address[]) view returns ((address,bool,bool,(address,address,address,address,address,address,address,address,(address,address),(address,address),uint256,uint256,bytes32,bytes32,bytes32,bytes32),(uint16,uint16,uint16,uint16,uint16,uint16,uint16,uint16,address,uint256,uint256,address,uint256),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,int256,int256,int256,int256),(uint256,uint256,uint256,uint256,uint256,uint256),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),(uint256,int256,uint256,uint256,uint256,uint256,(uint256,int256,uint256,uint256,uint256,uint256,int256)),(bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),(bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))[])",
  "function getAllVaultsAddresses() view returns (address[])",
]);

type Deployment = {
  chain: string;
  chainId: number;
  lendingResolver?: string;
  vaultResolver?: string;
};
type TokenMeta = { address: string; symbol: string; decimals: number; price: number };
type TokenMetaLike = {
  address?: string;
  symbol?: string;
  decimals?: string | number;
  price?: string | number;
};
type FTokenApi = {
  address: string;
  asset: { address: string; symbol: string; decimals: number; price?: string };
  rewardsRate?: string;
  rewards?: Array<{ rate?: string | number; type?: string; token?: { address?: string } }>;
};
type VaultApi = {
  supplyToken?: Record<string, Partial<TokenMeta>>;
  borrowToken?: Record<string, Partial<TokenMeta>>;
};
type BorrowAggregate = { borrowedUsd: number; weightedBorrowApr: number };

const deployments = Object.fromEntries(
  DEPLOYMENTS.map(([chain, chainId, lendingResolver, vaultResolver]) => [
    chain,
    { chain, chainId, lendingResolver, vaultResolver },
  ]),
) as Record<string, Deployment>;
const metaCache = new Map<number, Promise<{ fTokens: FTokenApi[]; tokens: Map<string, TokenMeta> }>>();

const fluidAdapter: LendingAdapter = {
  id: "fluid",
  protocol: "Fluid",
  version: ADAPTER_VERSION.CONTRACT_RPC_SNAPSHOT,
  adapter: Object.fromEntries(
    DEPLOYMENTS.map(([chain, chainId, lendingResolver]) => [
      chain,
      { start: lendingResolver ? START : "9999-12-31", chainId },
    ]),
  ),
  supportedChains: DEPLOYMENTS.map(([chain]) => chain),
  dataAvailability: {
    current: true,
    history: {
      granularity: "1d",
      startDateByChain: Object.fromEntries(
        DEPLOYMENTS.filter(([, , lendingResolver]) => lendingResolver).map(([chain]) => [chain, START]),
      ),
    },
  },

  async fetch(options: LendingFetchOptions): Promise<LendingAdapterRow[]> {
    const deployment = deploymentFor(options.chain);
    if (!deployment.lendingResolver || !deployment.vaultResolver) {
      return options.runMode === "daily" ? [] : apiOnlyRows(deployment, options);
    }

    const blockNumber = options.runMode === "daily"
      ? await historyBlock(options)
      : options.blockNumber ?? options.blockNumbers?.[options.chain];
    const [metadata, fTokens, vaults] = await Promise.all([
      metadataFor(deployment.chainId),
      readFTokens(deployment, options, blockNumber),
      readVaults(deployment, options, blockNumber),
    ]);
    const borrowByAsset = borrowAggregates(deployment, vaults, metadata.tokens);
    return [
      ...fTokenRows(deployment, options, fTokens, metadata, borrowByAsset, blockNumber),
      ...vaultRows(deployment, options, vaults, metadata.tokens, blockNumber),
    ].filter((row) => !options.assets?.length || options.assets.includes(row.market.assetSymbol.toLowerCase().split("/")[0]));
  },
};

async function apiOnlyRows(deployment: Deployment, options: LendingFetchOptions): Promise<LendingAdapterRow[]> {
  const { fTokens } = await metadataFor(deployment.chainId);
  return fTokens.map((token) => {
    const supplied = amount(token.address ? (token as any).totalAssets : undefined, token.asset.decimals);
    const withdrawable = amount((token as any).liquiditySupplyData?.withdrawable, token.asset.decimals);
    return row({
      deployment,
      options,
      id: `fluid-${deployment.chain}-${token.asset.symbol.toLowerCase()}-${addr(token.asset.address)}`,
      marketType: "pooled",
      symbol: token.asset.symbol,
      asset: token.asset.address,
      decimals: token.asset.decimals,
      contracts: [token.address, token.asset.address],
      values: marketValues({
        supplyApr: pct((token as any).supplyRate),
        rewardSupplyApr: rewardApr(token),
        borrowApr: null,
        rewardBorrowApr: null,
        suppliedUsd: supplied * num(token.asset.price),
        borrowedUsd: Math.max(supplied - withdrawable, 0) * num(token.asset.price),
        availableUsd: withdrawable * num(token.asset.price),
        ltv: null,
      }),
      raw: { token },
      source: tokensUrl(deployment.chainId),
    });
  });
}

function fTokenRows(
  deployment: Deployment,
  options: LendingFetchOptions,
  fTokens: any[],
  metadata: { fTokens: FTokenApi[]; tokens: Map<string, TokenMeta> },
  borrowByAsset: Map<string, BorrowAggregate>,
  blockNumber?: bigint,
): LendingAdapterRow[] {
  const apiByFToken = new Map(metadata.fTokens.map((token) => [addr(token.address), token]));
  return fTokens.flatMap((token) => {
    const tokenAddress = addr(token[0]);
    const api = apiByFToken.get(tokenAddress);
    if (!api) return [];
    const asset = addr(token[6]);
    const meta = metadata.tokens.get(asset) ?? tokenMeta(api.asset);
    const totalAssets = unitsToNumber(token[7], meta.decimals);
    const withdrawable = unitsToNumber(token[14][8], meta.decimals);
    const borrowedUsd = Math.max(totalAssets - withdrawable, 0) * meta.price;
    const borrow = borrowByAsset.get(asset);
    return row({
      deployment,
      options,
      id: `fluid-${deployment.chain}-${meta.symbol.toLowerCase()}-${asset}`,
      marketType: "pooled",
      symbol: meta.symbol,
      asset,
      decimals: meta.decimals,
      contracts: [tokenAddress, asset, deployment.lendingResolver!],
      values: marketValues({
        supplyApr: pct(token[12]),
        rewardSupplyApr: rewardApr(api) + (rewardRate(token[11]) ?? 0),
        borrowApr: borrow?.borrowedUsd ? borrow.weightedBorrowApr / borrow.borrowedUsd : 0,
        rewardBorrowApr: null,
        suppliedUsd: totalAssets * meta.price,
        borrowedUsd,
        availableUsd: withdrawable * meta.price,
        ltv: null,
      }),
      raw: jsonSafe({ token, api, borrow }),
      blockNumber,
      source: deployment.lendingResolver!,
    });
  });
}

function vaultRows(
  deployment: Deployment,
  options: LendingFetchOptions,
  vaults: any[],
  tokens: Map<string, TokenMeta>,
  blockNumber?: bigint,
): LendingAdapterRow[] {
  return vaults.flatMap((vault, index) => {
    if (vault[1] || vault[2]) return [];
    const supplyAsset = normalizeToken(vault[3][8][0]);
    const borrowAsset = normalizeToken(vault[3][9][0]);
    const supply = tokens.get(supplyAsset);
    const borrow = tokens.get(borrowAsset);
    if (!supply || !borrow) return [];
    const totalSupply = unitsToNumber(vault[8][5], supply.decimals);
    const totalBorrow = unitsToNumber(vault[8][4], borrow.decimals);
    const borrowable = unitsToNumber(vault[7][5], borrow.decimals);
    return row({
      deployment,
      options,
      id: `fluid-${deployment.chain}-vault-${addr(vault[0])}`,
      marketType: "vault",
      symbol: `${supply.symbol}/${borrow.symbol}`,
      asset: supplyAsset,
      decimals: supply.decimals,
      contracts: [vault[0], supplyAsset, borrowAsset, deployment.vaultResolver!],
      values: marketValues({
        supplyApr: pct(vault[5][10]),
        rewardSupplyApr: rewardRate(vault[5][12]),
        borrowApr: pct(vault[5][11]),
        rewardBorrowApr: rewardRate(vault[5][13]),
        suppliedUsd: totalSupply * supply.price,
        borrowedUsd: totalBorrow * borrow.price,
        availableUsd: borrowable * borrow.price,
        ltv: Number(vault[4][2]) / 100,
        liquidationThreshold: Number(vault[4][3]) / 100,
      }),
      raw: jsonSafe({ vault, vaultId: index + 1 }),
      blockNumber,
      source: deployment.vaultResolver!,
    });
  });
}

function borrowAggregates(
  deployment: Deployment,
  vaults: any[],
  tokens: Map<string, TokenMeta>,
): Map<string, BorrowAggregate> {
  const byAsset = new Map<string, BorrowAggregate>();
  for (const vault of vaults) {
    if (vault[1] || vault[2]) continue;
    const borrowAsset = normalizeToken(vault[3][9][0]);
    const meta = tokens.get(borrowAsset);
    if (!meta) continue;
    const borrowedUsd = unitsToNumber(vault[8][4], meta.decimals) * meta.price;
    const borrowApr = pct(vault[5][11]) ?? 0;
    addBorrowAggregate(byAsset, borrowAsset, borrowedUsd, borrowApr);
    const wrappedNative = WRAPPED_NATIVE[deployment.chain];
    if (borrowAsset === ZERO && wrappedNative) {
      addBorrowAggregate(byAsset, wrappedNative, borrowedUsd, borrowApr);
    }
  }
  return byAsset;
}

function addBorrowAggregate(
  byAsset: Map<string, BorrowAggregate>,
  asset: string,
  borrowedUsd: number,
  borrowApr: number,
): void {
  const item = byAsset.get(asset) ?? { borrowedUsd: 0, weightedBorrowApr: 0 };
  item.borrowedUsd += borrowedUsd;
  item.weightedBorrowApr += borrowedUsd * borrowApr;
  byAsset.set(asset, item);
}

async function readFTokens(deployment: Deployment, options: LendingFetchOptions, blockNumber?: bigint): Promise<any[]> {
  return publicClientFor(options, deployment.chain).readContract({
    address: deployment.lendingResolver as Address,
    abi: fTokenResolverAbi,
    functionName: "getFTokensEntireData",
    ...(blockNumber ? { blockNumber } : {}),
  }) as Promise<any[]>;
}

async function readVaults(deployment: Deployment, options: LendingFetchOptions, blockNumber?: bigint): Promise<any[]> {
  const client = publicClientFor(options, deployment.chain);
  if (deployment.chain === CHAIN.POLYGON) {
    const vaults = await client.readContract({
      address: deployment.vaultResolver as Address,
      abi: vaultResolverAbi,
      functionName: "getAllVaultsAddresses",
      ...(blockNumber ? { blockNumber } : {}),
    }) as Address[];
    return client.readContract({
      address: deployment.vaultResolver as Address,
      abi: vaultResolverAbi,
      functionName: "getVaultsEntireData",
      args: [vaults],
      ...(blockNumber ? { blockNumber } : {}),
    }) as Promise<any[]>;
  }
  return client.readContract({
    address: deployment.vaultResolver as Address,
    abi: vaultResolverAbi,
    functionName: "getVaultsEntireData",
    ...(blockNumber ? { blockNumber } : {}),
  }) as Promise<any[]>;
}

async function metadataFor(chainId: number): Promise<{ fTokens: FTokenApi[]; tokens: Map<string, TokenMeta> }> {
  const cached = metaCache.get(chainId);
  if (cached) return cached;
  const promise = Promise.all([
    fluidGet<{ data?: FTokenApi[] } | FTokenApi[]>(tokensUrl(chainId)),
    fluidGet<VaultApi[] | { data?: VaultApi[] }>(vaultsUrl(chainId)),
  ]).then(([tokenData, vaultData]) => {
    const fTokens = Array.isArray(tokenData) ? tokenData : tokenData.data ?? [];
    const vaults = Array.isArray(vaultData) ? vaultData : vaultData.data ?? [];
    const tokens = new Map<string, TokenMeta>();
    for (const token of fTokens) tokens.set(addr(token.asset.address), tokenMeta(token.asset));
    for (const vault of vaults) {
      for (const side of [vault.supplyToken, vault.borrowToken]) {
        for (const token of Object.values(side ?? {})) {
          if (isRealTokenMeta(token)) {
            tokens.set(normalizeToken(token.address), tokenMeta(token));
          }
        }
      }
    }
    return { fTokens, tokens };
  });
  metaCache.set(chainId, promise);
  return promise;
}

function row(args: {
  deployment: Deployment;
  options: LendingFetchOptions;
  id: string;
  marketType: "pooled" | "vault";
  symbol: string;
  asset: string;
  decimals: number;
  contracts: string[];
  values: LendingMarketValues;
  raw: unknown;
  source: string;
  blockNumber?: bigint;
}): LendingAdapterRow {
  return {
    market: createLendingMarket({
      id: args.id,
      protocol: "Fluid",
      chain: args.deployment.chain,
      adapterId: "fluid",
      marketType: args.marketType,
      assetSymbol: args.symbol,
      assetAddress: args.asset,
      assetDecimals: args.decimals,
      sourceMethod: "Fluid resolver contracts and Fluid token metadata API",
      contracts: args.contracts,
    }),
    values: args.values,
    raw: args.raw,
    blockNumber: args.blockNumber ?? args.options.blockNumber ?? args.options.blockNumbers?.[args.deployment.chain] ?? 0,
    source: {
      source: {
        kind: args.options.runMode === "daily" ? "rpc" : "api+rpc",
        endpoint: args.source,
        chainId: args.deployment.chainId,
        mode: args.options.runMode === "daily" ? "historical-day" : "latest",
      },
    },
  };
}

function marketValues(args: {
  supplyApr: number | null;
  rewardSupplyApr: number | null;
  borrowApr: number | null;
  rewardBorrowApr: number | null;
  suppliedUsd: number;
  borrowedUsd: number | null;
  availableUsd: number | null;
  ltv: number | null;
  liquidationThreshold?: number | null;
}): LendingMarketValues {
  const supplyApy = aprPercentToApy(args.supplyApr ?? 0);
  const rewardSupplyApy = args.rewardSupplyApr ? aprPercentToApy(args.rewardSupplyApr) : null;
  return {
    supplyApy,
    borrowApy: aprPercentToApy(args.borrowApr ?? 0),
    rewardSupplyApy,
    rewardBorrowApy: args.rewardBorrowApr ? aprPercentToApy(args.rewardBorrowApr) : null,
    netSupplyApy: supplyApy === null ? null : round(supplyApy + (rewardSupplyApy ?? 0), 6),
    totalSuppliedUsd: round(args.suppliedUsd, 2),
    totalBorrowedUsd: args.borrowedUsd === null ? null : round(args.borrowedUsd, 2),
    availableLiquidityUsd: args.availableUsd === null ? null : round(args.availableUsd, 2),
    utilization: args.borrowedUsd === null
      ? null
      : args.suppliedUsd > 0
        ? round((args.borrowedUsd / args.suppliedUsd) * 100, 6)
        : 0,
    ltv: args.ltv,
    liquidationThreshold: args.liquidationThreshold ?? null,
    isActive: true,
    isPaused: false,
  };
}

async function historyBlock(options: LendingFetchOptions): Promise<bigint | undefined> {
  return options.blockNumber ?? options.blockNumbers?.[options.chain] ?? await options.getStartBlock?.();
}

async function fluidGet<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Fluid API ${url} failed with ${response.status}`);
  return response.json() as Promise<T>;
}

function tokenMeta(token: TokenMetaLike): TokenMeta {
  return {
    address: normalizeToken(token.address ?? ZERO),
    symbol: token.symbol ?? "UNKNOWN",
    decimals: Number(token.decimals ?? 18),
    price: num(token.price),
  };
}

function isRealTokenMeta(token: TokenMetaLike): token is TokenMetaLike & { address: string } {
  if (!token.address) return false;
  const address = normalizeToken(token.address);
  if (address !== ZERO) return true;
  return Boolean(token.symbol || token.price);
}

function rewardApr(token: FTokenApi): number {
  const native = num(token.rewardsRate) / 1e12;
  const merkl = (token.rewards ?? [])
    .filter((reward) => !reward.type || reward.type === "supply")
    .reduce((sum, reward) => sum + (pct(reward.rate) ?? 0), 0);
  return round(native + merkl, 6);
}

function rewardRate(value: unknown): number | null {
  const rate = num(value) / 1e12;
  return rate > 0 ? round(rate, 6) : null;
}

function pct(value: unknown): number | null {
  const parsed = numOrNull(value);
  return parsed === null ? null : round(parsed / 100, 6);
}

function amount(value: unknown, decimals: number): number {
  return unitsToNumber(BigInt(String(value ?? 0)), decimals);
}

function num(value: unknown): number {
  return numOrNull(value) ?? 0;
}

function numOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeToken(address: string): string {
  const lower = addr(address);
  return lower === NATIVE ? ZERO : lower;
}

function addr(address: string): string {
  return address.toLowerCase();
}

function tokensUrl(chainId: number): string {
  return `${API}/v2/lending/${chainId}/tokens`;
}

function vaultsUrl(chainId: number): string {
  return `${API}/v2/borrowing/${chainId}/vaults`;
}

function deploymentFor(chain: string): Deployment {
  const deployment = deployments[chain];
  if (!deployment) throw new Error(`No Fluid deployment configured for ${chain}`);
  return deployment;
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as T;
}

export { fluidAdapter };
