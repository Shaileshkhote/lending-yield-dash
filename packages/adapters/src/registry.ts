import { aaveV3Adapter } from "./adapters/aave";
import { compoundV3Adapter } from "./adapters/compound";
import { morphoBlueAdapter } from "./adapters/morpho-blue";
import { sparkAdapter } from "./adapters/spark";
import type { LendingAdapter } from "./types";

export const lendingAdapters: LendingAdapter[] = [aaveV3Adapter, sparkAdapter, compoundV3Adapter, morphoBlueAdapter];

export function getAdapter(adapterId: string): LendingAdapter {
  const adapter = lendingAdapters.find((item) => item.id === adapterId);
  if (!adapter) {
    throw new Error(`No lending adapter registered for ${adapterId}`);
  }
  return adapter;
}
