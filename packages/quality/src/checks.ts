import type { CanonicalMarketSnapshot, QualityCheckResult } from "@stablewatch-lending/core";

type Check = (snapshot: CanonicalMarketSnapshot, previous?: CanonicalMarketSnapshot) => QualityCheckResult[];

export const qualityChecks: Check[] = [
  freshnessCheck,
  requiredFieldsCheck,
  apyBoundsCheck,
  apySpikeCheck,
  utilizationBoundsCheck,
  borrowedLessThanSuppliedCheck,
  capViolationCheck,
  pausedMarketCheck
];

export function runQualityChecks(snapshot: CanonicalMarketSnapshot, previous?: CanonicalMarketSnapshot): QualityCheckResult[] {
  return qualityChecks.flatMap((check) => check(snapshot, previous));
}

function result(snapshot: CanonicalMarketSnapshot, partial: Omit<QualityCheckResult, "marketId">): QualityCheckResult {
  return {
    marketId: snapshot.marketId,
    ...partial
  };
}

function freshnessCheck(snapshot: CanonicalMarketSnapshot): QualityCheckResult[] {
  const ageMs = Date.now() - Date.parse(snapshot.timestamp);
  const ageHours = ageMs / 36e5;
  if (ageHours <= 2) {
    return [result(snapshot, { checkName: "freshness_check", status: "pass", severity: "low", message: "Snapshot is fresh" })];
  }
  return [
    result(snapshot, {
      checkName: "freshness_check",
      status: ageHours > 24 ? "fail" : "warn",
      severity: ageHours > 24 ? "high" : "medium",
      message: "Snapshot is older than expected",
      observedValue: `${ageHours.toFixed(2)}h`,
      expectedValue: "<=2h"
    })
  ];
}

function requiredFieldsCheck(snapshot: CanonicalMarketSnapshot): QualityCheckResult[] {
  const missing = [
    ["supplyApy", snapshot.supplyApy],
    ["borrowApy", snapshot.borrowApy],
    ["totalSuppliedUsd", snapshot.totalSuppliedUsd],
    ["totalBorrowedUsd", snapshot.totalBorrowedUsd],
    ["utilization", snapshot.utilization]
  ]
    .filter(([, value]) => value === null || value === undefined)
    .map(([field]) => field);

  if (!missing.length) {
    return [result(snapshot, { checkName: "missing_required_fields", status: "pass", severity: "low", message: "Required fields are present" })];
  }

  return [
    result(snapshot, {
      checkName: "missing_required_fields",
      status: "fail",
      severity: "high",
      message: "Required fields are missing",
      observedValue: missing.join(", ")
    })
  ];
}

function apyBoundsCheck(snapshot: CanonicalMarketSnapshot): QualityCheckResult[] {
  const apys = [
    ["supplyApy", snapshot.supplyApy],
    ["borrowApy", snapshot.borrowApy],
    ["rewardSupplyApy", snapshot.rewardSupplyApy],
    ["rewardBorrowApy", snapshot.rewardBorrowApy]
  ].filter(([, value]) => typeof value === "number") as [string, number][];

  const invalid = apys.filter(([, value]) => value < -5 || value > 200);
  if (!invalid.length) {
    return [result(snapshot, { checkName: "apy_bounds_check", status: "pass", severity: "low", message: "APY values are inside expected bounds" })];
  }

  return invalid.map(([field, value]) =>
    result(snapshot, {
      checkName: "apy_bounds_check",
      status: "fail",
      severity: "high",
      message: `${field} is outside expected APY bounds`,
      observedValue: String(value),
      expectedValue: "-5..200"
    })
  );
}

function apySpikeCheck(snapshot: CanonicalMarketSnapshot, previous?: CanonicalMarketSnapshot): QualityCheckResult[] {
  if (!previous || snapshot.supplyApy === null || previous.supplyApy === null) {
    return [result(snapshot, { checkName: "apy_spike_check", status: "pass", severity: "low", message: "No previous comparable APY snapshot" })];
  }

  const delta = Math.abs(snapshot.supplyApy - previous.supplyApy);
  if (delta <= 10) {
    return [result(snapshot, { checkName: "apy_spike_check", status: "pass", severity: "low", message: "APY movement is within threshold" })];
  }

  return [
    result(snapshot, {
      checkName: "apy_spike_check",
      status: delta > 25 ? "fail" : "warn",
      severity: delta > 25 ? "high" : "medium",
      message: "Supply APY moved sharply from previous snapshot",
      observedValue: `${delta.toFixed(2)}pp`,
      expectedValue: "<=10pp"
    })
  ];
}

function utilizationBoundsCheck(snapshot: CanonicalMarketSnapshot): QualityCheckResult[] {
  const utilization = snapshot.utilization;
  if (utilization !== null && utilization >= 0 && utilization <= 100) {
    return [result(snapshot, { checkName: "utilization_bounds_check", status: "pass", severity: "low", message: "Utilization is within 0-100%" })];
  }
  return [
    result(snapshot, {
      checkName: "utilization_bounds_check",
      status: "fail",
      severity: "high",
      message: "Utilization is outside 0-100%",
      observedValue: String(utilization),
      expectedValue: "0..100"
    })
  ];
}

function borrowedLessThanSuppliedCheck(snapshot: CanonicalMarketSnapshot): QualityCheckResult[] {
  if (snapshot.totalBorrowedUsd === null || snapshot.totalSuppliedUsd === null || snapshot.totalBorrowedUsd <= snapshot.totalSuppliedUsd * 1.001) {
    return [result(snapshot, { checkName: "borrowed_lte_supplied_check", status: "pass", severity: "low", message: "Borrowed amount does not exceed supplied amount" })];
  }
  return [
    result(snapshot, {
      checkName: "borrowed_lte_supplied_check",
      status: "fail",
      severity: "high",
      message: "Borrowed amount exceeds supplied amount",
      observedValue: String(snapshot.totalBorrowedUsd),
      expectedValue: `<=${snapshot.totalSuppliedUsd}`
    })
  ];
}

function capViolationCheck(snapshot: CanonicalMarketSnapshot): QualityCheckResult[] {
  const suppliedCapViolated = snapshot.supplyCapUsd !== null && snapshot.totalSuppliedUsd !== null && snapshot.totalSuppliedUsd > snapshot.supplyCapUsd * 1.001;
  const borrowCapViolated = snapshot.borrowCapUsd !== null && snapshot.totalBorrowedUsd !== null && snapshot.totalBorrowedUsd > snapshot.borrowCapUsd * 1.001;
  if (!suppliedCapViolated && !borrowCapViolated) {
    return [result(snapshot, { checkName: "cap_violation_check", status: "pass", severity: "low", message: "Market caps are not exceeded" })];
  }
  return [
    result(snapshot, {
      checkName: "cap_violation_check",
      status: "fail",
      severity: "high",
      message: "Supply or borrow cap appears exceeded",
      observedValue: `supplied=${snapshot.totalSuppliedUsd}, borrowed=${snapshot.totalBorrowedUsd}`,
      expectedValue: `supplyCap=${snapshot.supplyCapUsd}, borrowCap=${snapshot.borrowCapUsd}`
    })
  ];
}

function pausedMarketCheck(snapshot: CanonicalMarketSnapshot): QualityCheckResult[] {
  if (!snapshot.isPaused && snapshot.isActive) {
    return [result(snapshot, { checkName: "paused_market_check", status: "pass", severity: "low", message: "Market is active and not paused" })];
  }
  return [
    result(snapshot, {
      checkName: "paused_market_check",
      status: snapshot.isPaused ? "warn" : "fail",
      severity: snapshot.isPaused ? "medium" : "high",
      message: "Market is paused or inactive"
    })
  ];
}
