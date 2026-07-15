import type { MarketDefinition } from "@lendingscope/core";
import type {
  LendingAdapterRow,
  LendingAdapter,
  LendingChainConfig,
  LendingFetchOptions,
  LendingMarketValues,
} from "../../types";
import { CHAIN } from "../../helpers/chains";
import { paginateTheGraph } from "../../helpers/graphql";
import { createLendingMarket } from "../../helpers/market";
import { subgraphSource } from "../../helpers/source";
import {
  bpsToPercent,
  capToUsd,
  rayAprToApy,
  round,
  unitsToNumber,
} from "../../helpers/units";
import { ADAPTER_VERSION } from "../../helpers/version";

const SUBGRAPH_DEPLOYMENTS = [
  {
    chain: CHAIN.ETHEREUM,
    protocol: "Aave V3",
    adapterId: "aave-v3",
    poolAddressesProvider: addressFromEnv(
      "AAVE_V3_ETHEREUM_POOL_ADDRESSES_PROVIDER",
      "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
    ),
    subgraphId:
      process.env.AAVE_V3_ETHEREUM_SUBGRAPH_ID ??
      "Cd2gEDVeqnjBn1hSeqFMitw8Q1iiyV9FYUZkLNRcL87g",
    subgraphStartBlock: 16291006,
    startDate: "2022-12-27",
  },
  {
    chain: CHAIN.BASE,
    protocol: "Aave V3",
    adapterId: "aave-v3",
    poolAddressesProvider: addressFromEnv(
      "AAVE_V3_BASE_POOL_ADDRESSES_PROVIDER",
      "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
    ),
    subgraphId:
      process.env.AAVE_V3_BASE_SUBGRAPH_ID ??
      "GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF",
    subgraphStartBlock: 2357105,
    startDate: "2023-08-21",
  },
];

const chainConfig: Record<string, LendingChainConfig> = Object.fromEntries(
  SUBGRAPH_DEPLOYMENTS.map((deployment) => [
    deployment.chain,
    {
      start: deployment.startDate,
      subgraphId: deployment.subgraphId,
      poolAddressesProvider: deployment.poolAddressesProvider,
      subgraphStartBlock: deployment.subgraphStartBlock,
    },
  ]),
);

const reserveCache = new Map<string, any>();

const aaveV3Adapter: LendingAdapter = {
  id: "aave-v3",
  protocol: "Aave V3",
  version: ADAPTER_VERSION.GRAPHQL_SUBGRAPH_SNAPSHOT,
  adapter: chainConfig,
  supportedChains: SUBGRAPH_DEPLOYMENTS.map((deployment) => deployment.chain),
  dataAvailability: {
    current: true,
    history: {
      granularity: "1d",
      startDateByChain: Object.fromEntries(
        SUBGRAPH_DEPLOYMENTS.map((deployment) => [
          deployment.chain,
          deployment.startDate,
        ]),
      ),
    },
  },

  async fetch(options: LendingFetchOptions): Promise<LendingAdapterRow[]> {
    const deployment = deploymentForChain(options.chain);
    const reserves = await loadSubgraphReserves(deployment, options);
    const rows: LendingAdapterRow[] = [];
    const blockNumber =
      options.blockNumber ??
      options.blockNumbers?.[deployment.chain] ??
      BigInt(reserves._meta?.block?.number ?? 0);

    for (const reserve of reserves.reserves) {
      if (
        options.assets?.length &&
        !options.assets.includes(reserve.symbol.toLowerCase())
      )
        continue;
      const market = marketFromSubgraphReserve(deployment, reserve);
      rows.push({
        market,
        values: normalizeSubgraphReserve(reserve),
        raw: reserve,
        blockNumber,
        source: subgraphSource({
          alias: "aaveSubgraph",
          id: deployment.subgraphId,
          blockNumber,
          mode:
            options.blockNumber || options.blockNumbers?.[deployment.chain]
              ? "historical-block"
              : "latest",
        }),
      });
    }

    return rows;
  },
};

async function loadSubgraphReserves(
  deployment: any,
  ctx: LendingFetchOptions,
): Promise<any> {
  const blockNumber = ctx.blockNumbers?.[deployment.chain];
  if (blockNumber && blockNumber < BigInt(deployment.subgraphStartBlock)) {
    throw new Error(
      `${deployment.adapterId}:${deployment.chain} subgraph starts at block ${deployment.subgraphStartBlock}, requested ${blockNumber.toString()}`,
    );
  }

  const cacheKey = `${deployment.subgraphId}:${blockNumber?.toString() ?? "latest"}:${ctx.assets?.join(",") ?? "all"}`;
  const cached = reserveCache.get(cacheKey);
  if (cached) return cached;

  const page = await paginateTheGraph<any, any>({
    subgraphId: deployment.subgraphId,
    query: reservesQuery(blockNumber),
    getItems: (data) => data.reserves,
  });

  const value = { _meta: page.lastData?._meta, reserves: page.items };
  reserveCache.set(cacheKey, value);
  return value;
}

function reservesQuery(blockNumber?: bigint): string {
  const blockClause = blockNumber
    ? `, block: { number: ${blockNumber.toString()} }`
    : "";
  return `query AaveReserves($first: Int!, $skip: Int!) {
    _meta { block { number } }
    reserves(first: $first, skip: $skip, orderBy: id, orderDirection: asc${blockClause}) {
      id
      underlyingAsset
      symbol
      name
      decimals
      liquidityRate
      variableBorrowRate
      utilizationRate
      totalLiquidity
      availableLiquidity
      totalCurrentVariableDebt
      totalPrincipalStableDebt
      baseLTVasCollateral
      reserveLiquidationThreshold
      reserveFactor
      supplyCap
      borrowCap
      isActive
      isPaused
      isFrozen
      price { priceInEth }
    }
  }`;
}

function marketFromSubgraphReserve(
  deployment: any,
  reserve: any,
): MarketDefinition {
  return createLendingMarket({
    id: `${deployment.adapterId}-${deployment.chain}-${reserve.symbol.toLowerCase()}-${reserve.underlyingAsset.toLowerCase()}`,
    protocol: deployment.protocol,
    chain: deployment.chain,
    adapterId: deployment.adapterId,
    marketType: "pooled",
    assetSymbol: reserve.symbol,
    assetAddress: reserve.underlyingAsset,
    assetDecimals: Number(reserve.decimals),
    sourceMethod: "The Graph Aave reserves(block) query",
    contracts: [deployment.poolAddressesProvider, deployment.subgraphId],
  });
}

function normalizeSubgraphReserve(
  reserve: any,
): LendingMarketValues {
  const decimals = Number(reserve.decimals);
  const priceUsd = Number(reserve.price?.priceInEth ?? 0) / 1e8;
  const supplied = unitsToNumber(BigInt(reserve.totalLiquidity), decimals);
  const available = unitsToNumber(BigInt(reserve.availableLiquidity), decimals);
  const variableDebt = unitsToNumber(
    BigInt(reserve.totalCurrentVariableDebt),
    decimals,
  );
  const stableDebt = unitsToNumber(
    BigInt(reserve.totalPrincipalStableDebt),
    decimals,
  );
  const borrowed = variableDebt + stableDebt;
  const fallbackSupplied = available + borrowed;
  const effectiveSupplied = supplied > 0 ? supplied : fallbackSupplied;

  return {
    supplyApy: rayAprToApy(BigInt(reserve.liquidityRate)),
    borrowApy: rayAprToApy(BigInt(reserve.variableBorrowRate)),
    rewardSupplyApy: null,
    rewardBorrowApy: null,
    totalSuppliedUsd: round(effectiveSupplied * priceUsd, 2),
    totalBorrowedUsd: round(borrowed * priceUsd, 2),
    availableLiquidityUsd: round(available * priceUsd, 2),
    utilization:
      effectiveSupplied > 0
        ? round((borrowed / effectiveSupplied) * 100, 6)
        : round(Number(reserve.utilizationRate) * 100, 6),
    ltv: bpsToPercent(Number(reserve.baseLTVasCollateral)),
    liquidationThreshold: bpsToPercent(
      Number(reserve.reserveLiquidationThreshold),
    ),
    reserveFactor: bpsToPercent(Number(reserve.reserveFactor)),
    supplyCapUsd: capToUsd(BigInt(reserve.supplyCap ?? 0), 0, priceUsd),
    borrowCapUsd: capToUsd(BigInt(reserve.borrowCap ?? 0), 0, priceUsd),
    isActive: reserve.isActive && !reserve.isFrozen,
    isPaused: reserve.isPaused,
  };
}

function deploymentForChain(chain: string): any {
  const deployment = SUBGRAPH_DEPLOYMENTS.find((item) => item.chain === chain);
  if (!deployment) {
    throw new Error(`No Aave V3 subgraph deployment configured for ${chain}`);
  }
  return deployment;
}

function addressFromEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export { aaveV3Adapter };
