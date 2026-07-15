import type { AdapterContext } from "@lendingscope/core";
import type { LendingAdapter, LendingFetchOptions } from "../types";
import { blockAtOrBeforeAny, rpcCandidatesForContext } from "./rpc";
import {
  isDateAfterDeadFrom,
  isDateBeforeStart,
  rollingWindow,
  utcDateString,
  utcDayWindow,
} from "./dates";

export type LendingRunMode = NonNullable<LendingFetchOptions["runMode"]>;

export function buildLendingFetchOptions(args: {
  adapter: LendingAdapter;
  chain: string;
  ctx: AdapterContext;
  runMode?: LendingRunMode;
  blockNumber?: bigint;
}): LendingFetchOptions {
  const runMode = args.runMode ?? inferRunMode(args.ctx);
  const window =
    runMode === "latest"
      ? rollingWindow(args.ctx.now)
      : utcDayWindow(args.ctx.now);
  const blockNumber =
    args.blockNumber ?? args.ctx.blockNumbers?.[args.chain];
  const blockNumbers = filterDefined({
    [args.chain]: blockNumber,
  });

  const getBlockForTimestamp = async (
    timestamp: number,
  ): Promise<bigint | undefined> => {
    const urls = rpcCandidatesForContext(args.ctx, args.chain);
    if (!urls.length) return undefined;
    return blockAtOrBeforeAny(urls, BigInt(timestamp));
  };

  return {
    ...args.ctx,
    chain: args.chain,
    chains: [args.chain],
    blockNumber,
    blockNumbers,
    runMode,
    ...window,
    getBlockForTimestamp,
    getStartBlock: async () => blockNumber ?? getBlockForTimestamp(window.startTimestamp),
    getEndBlock: async () => blockNumber ?? getBlockForTimestamp(window.endTimestamp - 1),
  };
}

export function chainsForLendingRun(args: {
  adapter: LendingAdapter;
  chainFilter?: string[];
  runMode: LendingRunMode;
  dateString?: string;
}): string[] {
  const requestedChains = args.chainFilter?.length
    ? args.chainFilter
    : Object.keys(args.adapter.adapter);

  return requestedChains.filter((chain) =>
    canRunLendingAdapterChain({
      adapter: args.adapter,
      chain,
      runMode: args.runMode,
      dateString: args.dateString,
    }),
  );
}

export function canRunLendingAdapterChain(args: {
  adapter: LendingAdapter;
  chain: string;
  runMode: LendingRunMode;
  dateString?: string;
}): boolean {
  const chainConfig = args.adapter.adapter[args.chain];
  if (!chainConfig) return false;
  const dateString = args.dateString ?? utcDateString(new Date());

  if (isDateAfterDeadFrom(dateString, chainConfig.deadFrom as string | undefined)) {
    return false;
  }

  if (args.runMode === "latest") {
    return args.adapter.dataAvailability.current;
  }

  const historyStart =
    args.adapter.dataAvailability.history?.startDateByChain[args.chain] ??
    chainConfig.start;
  return !isDateBeforeStart(dateString, historyStart);
}

function inferRunMode(ctx: AdapterContext): LendingRunMode {
  return utcDateString(ctx.now) < utcDateString(new Date()) ? "daily" : "latest";
}

function filterDefined<T>(
  record: Partial<Record<string, T | undefined>>,
): Partial<Record<string, T>> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Partial<Record<string, T>>;
}
