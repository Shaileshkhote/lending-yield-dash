import { describe, expect, it } from "vitest";
import type { RawMarketSnapshot } from "@stablewatch-lending/core";
import { CHAIN } from "./helpers/chains";
import { normalizeProtocolSnapshot } from "./helpers/protocol-snapshot";
import { rpcCandidatesForChain } from "./helpers/rpc";
import { ADAPTER_VERSION } from "./helpers/version";
import { getAdapter } from "./registry";

describe("lending adapters", () => {
  it("resolves RPC candidates from env first and public fallbacks second", () => {
    const previous = process.env.ETHEREUM_RPC_URL;
    process.env.ETHEREUM_RPC_URL = "https://example-rpc.invalid";

    try {
      const candidates = rpcCandidatesForChain(CHAIN.ETHEREUM);

      expect(candidates[0]).toBe("https://example-rpc.invalid");
      expect(candidates).toContain("https://mainnet.gateway.tenderly.co");
    } finally {
      if (previous === undefined) {
        delete process.env.ETHEREUM_RPC_URL;
      } else {
        process.env.ETHEREUM_RPC_URL = previous;
      }
    }
  });

  it("normalizes raw protocol payloads into the canonical shape", async () => {
    const raw = rawSnapshotFixture("aave-v3-base-usdc");
    const snapshot = normalizeProtocolSnapshot(raw);

    expect(snapshot.marketId).toBe("aave-v3-base-usdc");
    expect(snapshot.supplyApy).toBeGreaterThan(0);
    expect(snapshot.source.payloadHash).toMatch(/^sha256:/);
  });

  it("exposes DefiLlama-style adapter maps", () => {
    expect(getAdapter("aave-v3").fetch).toEqual(expect.any(Function));
    expect(getAdapter("aave-v3").adapter.base.start).toBe("2023-08-21");
    expect(getAdapter("aave-v4").protocol).toBe("Aave V4");
    expect(getAdapter("aave-v4").version).toBe(
      ADAPTER_VERSION.OFFICIAL_GRAPHQL_SNAPSHOT,
    );
    expect(getAdapter("aave-v4").adapter.ethereum.chainId).toBe(1);
    expect(getAdapter("aave-v4").adapter.ethereum.start).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(getAdapter("spark").protocol).toBe("Spark");
    expect(getAdapter("spark").version).toBe(
      ADAPTER_VERSION.GRAPHQL_SUBGRAPH_SNAPSHOT,
    );
    expect(getAdapter("spark").adapter.ethereum.start).toBe("2023-03-07");
    expect(getAdapter("compound-v3").protocol).toBe("Compound III");
    expect(getAdapter("compound-v3").version).toBe(
      ADAPTER_VERSION.GRAPHQL_SUBGRAPH_SNAPSHOT,
    );
    expect(getAdapter("morpho-blue").protocol).toBe("Morpho Blue");
    expect(getAdapter("morpho-blue").version).toBe(
      ADAPTER_VERSION.OFFICIAL_GRAPHQL_SNAPSHOT,
    );
  });

  it("declares source availability for refill planning", () => {
    expect(
      getAdapter("aave-v3").dataAvailability.history?.startDateByChain.ethereum,
    ).toBe("2022-12-27");
    expect(
      getAdapter("aave-v3").dataAvailability.history?.startDateByChain.base,
    ).toBe("2023-08-21");
    expect(getAdapter("aave-v4").dataAvailability.current).toBe(true);
    expect(
      getAdapter("aave-v4").dataAvailability.history?.startDateByChain
        .ethereum,
    ).toBe(getAdapter("aave-v4").adapter.ethereum.start);
    expect(
      getAdapter("spark").dataAvailability.history?.startDateByChain.ethereum,
    ).toBe("2023-03-07");
    expect(
      getAdapter("compound-v3").dataAvailability.history?.startDateByChain
        .ethereum,
    ).toBe("2022-08-13");
    expect(
      getAdapter("morpho-blue").dataAvailability.history?.startDateByChain
        .ethereum,
    ).toBe("2024-01-02");
    expect(
      getAdapter("morpho-blue").dataAvailability.history?.startDateByChain.base,
    ).toBe("2024-05-15");
  });
});

function rawSnapshotFixture(marketId: string): RawMarketSnapshot {
  return {
    runId: "test-run",
    adapterId: "aave-v3",
    protocol: "Aave V3",
    chain: "base",
    marketId,
    blockNumber: 123,
    sourceMethod: "The Graph Aave reserves(block) query",
    contracts: ["0xprovider", "0xui"],
    collectedAt: "2026-07-14T00:00:00.000Z",
    payloadHash: "sha256:test",
    payload: {
      market: {
        id: marketId,
        protocol: "Aave V3",
        chain: "base",
        adapterId: "aave-v3",
        marketType: "pooled",
        assetSymbol: "USDC",
        assetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        assetDecimals: 6,
        sourceMethod: "The Graph Aave reserves(block) query",
        contracts: ["0xprovider", "0xui"],
      },
      protocolResponse: {
        reserve: {
          supplyApy: 5,
          borrowApy: 7,
          rewardSupplyApy: null,
          rewardBorrowApy: null,
          totalSuppliedUsd: 100,
          totalBorrowedUsd: 80,
          availableLiquidityUsd: 20,
          utilization: 80,
          ltv: 78,
          liquidationThreshold: 80,
          reserveFactor: 10,
          supplyCapUsd: null,
          borrowCapUsd: null,
          isActive: true,
          isPaused: false,
        },
      },
    },
  };
}
