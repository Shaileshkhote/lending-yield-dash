import { describe, expect, it } from "vitest";
import type { CanonicalMarketSnapshot } from "@lendingscope/core";
import { runQualityChecks } from "./checks";
import { scoreQuality } from "./scoring";

const snapshot: CanonicalMarketSnapshot = {
  timestamp: new Date().toISOString(),
  blockNumber: 1,
  protocol: "Aave V3",
  adapterId: "aave-v3",
  chain: "base",
  marketId: "aave-v3-base-usdc",
  marketType: "pooled",
  assetSymbol: "USDC",
  assetAddress: "0x",
  supplyApy: 5,
  borrowApy: 7,
  rewardSupplyApy: null,
  rewardBorrowApy: null,
  netSupplyApy: 5,
  totalSuppliedUsd: 100,
  totalBorrowedUsd: 80,
  availableLiquidityUsd: 20,
  utilization: 80,
  ltv: 78,
  liquidationThreshold: 80,
  reserveFactor: 10,
  supplyCapUsd: 200,
  borrowCapUsd: 150,
  isActive: true,
  isPaused: false,
  dataQualityScore: 100,
  source: { payloadHash: "sha256:test", method: "test-fixture", contracts: [] }
};

describe("quality checks", () => {
  it("scores healthy snapshots highly", () => {
    const results = runQualityChecks(snapshot);
    expect(results.every((result) => result.status === "pass")).toBe(true);
    expect(scoreQuality(results)).toBe(100);
  });

  it("flags invalid utilization", () => {
    const results = runQualityChecks({ ...snapshot, utilization: 140 });
    expect(results.some((result) => result.checkName === "utilization_bounds_check" && result.status === "fail")).toBe(true);
  });
});
