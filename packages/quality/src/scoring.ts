import type { QualityCheckResult } from "@stablewatch-lending/core";

export function scoreQuality(results: QualityCheckResult[]): number {
  const penalty = results.reduce((total, result) => {
    if (result.status === "pass") return total;
    if (result.status === "warn") return total + (result.severity === "high" ? 15 : result.severity === "medium" ? 10 : 5);
    return total + (result.severity === "high" ? 35 : result.severity === "medium" ? 25 : 15);
  }, 0);

  return Math.max(0, Math.min(100, 100 - penalty));
}

export function qualityLabel(score: number): "Healthy" | "Watch" | "Degraded" | "Unreliable" {
  if (score >= 95) return "Healthy";
  if (score >= 80) return "Watch";
  if (score >= 50) return "Degraded";
  return "Unreliable";
}
