import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createPublicClient, http, type PublicClient } from "viem";
import { loadEnv } from "../config/env";
import {
  isSupportedChain,
  lendingAdapters,
  normalizeChain,
  rpcCandidatesForChain,
  SUPPORTED_CHAINS,
  type LendingAdapter,
  type Chain,
} from "@stablewatch-lending/adapters";
import type {
  AdapterContext,
  CanonicalMarketSnapshot,
} from "@stablewatch-lending/core";

type RpcCandidateMap = Partial<Record<Chain, string[]>>;
type BlockNumberMap = Partial<Record<string, bigint>>;

loadEnv();

async function main() {
  const targets = parseTargets(process.argv.slice(2));
  const adapterFilter = csvEnv("HISTORY_ADAPTERS");
  const chainFilter = csvEnv("HISTORY_CHAINS").map(normalizeChain);
  const assetFilter = csvEnv("HISTORY_ASSETS").map((asset) =>
    asset.toLowerCase(),
  );
  const chains = selectedChains(chainFilter);
  const rpcCandidates = Object.fromEntries(
    chains.map((chain) => [chain, rpcCandidatesForChain(chain)]),
  ) as RpcCandidateMap;
  const rpcUrls = Object.fromEntries(
    chains.map((chain) => [chain, rpcCandidates[chain]?.[0]]),
  );

  const output: Array<{
    date: string;
    chainBlocks: Record<string, string>;
    snapshots: CanonicalMarketSnapshot[];
    errors: Array<{ adapter: string; marketId?: string; message: string }>;
  }> = [];

  for (const target of targets) {
    const blockNumbers = await blockNumbersForTarget(target, rpcCandidates);
    const ctx: AdapterContext = {
      runId: `history_${target}`,
      now:
        target === "latest" ? new Date() : new Date(`${target}T00:00:00.000Z`),
      rpcUrls,
      blockNumbers,
      chains: chainFilter,
      assets: assetFilter,
    };

    const snapshots: CanonicalMarketSnapshot[] = [];
    const errors: Array<{
      adapter: string;
      marketId?: string;
      message: string;
    }> = [];

    for (const adapter of lendingAdapters.filter(
      (adapter) => !adapterFilter.length || adapterFilter.includes(adapter.id),
    )) {
      const adapterChains = chainsForTarget(adapter, target, chainFilter);
      if (!adapterChains.length) {
        errors.push({
          adapter: adapter.id,
          message: `${adapter.id} has no ${target === "latest" ? "current" : "daily history"} availability for ${target}`,
        });
        continue;
      }
      for (const chain of adapterChains) {
        try {
          const result = await adapter.fetch({
            ...ctx,
            chain,
            chains: [chain],
            blockNumber: blockNumbers[chain],
            blockNumbers: filterRecord(blockNumbers, [chain]),
          });
          snapshots.push(...result.snapshots);
          for (const item of result.errors ?? []) {
            errors.push({
              adapter: adapter.id,
              marketId: item.marketId,
              message: item.message,
            });
          }
        } catch (error) {
          errors.push({ adapter: adapter.id, message: errorMessage(error) });
        }
        await sleep(800);
      }
    }

    output.push({
      date: target,
      chainBlocks: stringifyBlockNumbers(blockNumbers),
      snapshots,
      errors,
    });
  }

  const path = join(
    process.cwd(),
    "public",
    "data",
    "lending",
    "history-samples",
    `${runSlug(targets, adapterFilter, chainFilter, assetFilter)}.json`,
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), rpcUrls, filters: { adapters: adapterFilter, chains: chainFilter, assets: assetFilter }, dates: output }, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        path,
        rpcUrls,
        dates: output.map((item) => ({
          date: item.date,
          chainBlocks: item.chainBlocks,
          snapshots: item.snapshots.length,
          errors: item.errors,
        })),
      },
      null,
      2,
    ),
  );
}

function parseTargets(args: string[]): string[] {
  const explicitTargets = args.filter((arg) => arg !== "--");
  const targets = explicitTargets.length
    ? explicitTargets
    : previousUtcDates(3);
  for (const target of targets) {
    if (target !== "latest" && !/^\d{4}-\d{2}-\d{2}$/.test(target)) {
      throw new Error(`Invalid date ${target}. Use YYYY-MM-DD or latest.`);
    }
  }
  return targets;
}

function previousUtcDates(count: number): string[] {
  const today = new Date();
  const dates: string[] = [];
  for (let offset = count; offset >= 1; offset -= 1) {
    const date = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - offset,
      ),
    );
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

function dateToUnix(date: string): bigint {
  return BigInt(Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 1000));
}

async function blockAtOrBefore(
  client: PublicClient,
  timestamp: bigint,
): Promise<bigint> {
  const latest = await client.getBlock();
  if (latest.timestamp <= timestamp) {
    return latest.number ?? 0n;
  }

  let low = 0n;
  let high = latest.number ?? 0n;
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    const block = await client.getBlock({ blockNumber: mid });
    if (block.timestamp <= timestamp) {
      low = mid;
    } else {
      high = mid - 1n;
    }
  }
  return low;
}

async function blockAtOrBeforeAny(
  urls: string[],
  timestamp: bigint,
): Promise<bigint> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      return await blockAtOrBefore(
        createPublicClient({ transport: http(url) }),
        timestamp,
      );
    } catch (error) {
      errors.push(`${url}: ${errorMessage(error)}`);
    }
  }
  throw new Error(
    `No RPC could resolve block for ${timestamp.toString()}: ${errors.join(" | ")}`,
  );
}

async function blockNumbersForTarget(
  target: string,
  rpcCandidates: RpcCandidateMap,
): Promise<BlockNumberMap> {
  const entries = Object.entries(rpcCandidates) as Array<[Chain, string[]]>;
  const blockNumbers: BlockNumberMap = {};
  if (target === "latest") {
    return blockNumbers;
  }
  const timestamp = dateToUnix(target);
  for (const [chain, urls] of entries) {
    blockNumbers[chain] = await blockAtOrBeforeAny(urls, timestamp);
  }
  return blockNumbers;
}

function csvEnv(envKey: string): string[] {
  return (
    process.env[envKey]
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function runSlug(
  targets: string[],
  adapterFilter: string[],
  chainFilter: string[],
  assetFilter: string[],
): string {
  return [
    targets.join("_"),
    adapterFilter.join("-") || "all-adapters",
    chainFilter.join("-") || "all-chains",
    assetFilter.join("-") || "all-assets",
  ]
    .map((part) => part.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"))
    .join("_");
}

function selectedChains(chainFilter: string[]): Chain[] {
  const invalid = chainFilter.filter((chain) => !isSupportedChain(chain));
  if (invalid.length) {
    throw new Error(`Unsupported chain filter: ${invalid.join(", ")}`);
  }
  const chains = chainFilter.length ? chainFilter : [...SUPPORTED_CHAINS];
  return [...new Set(chains)] as Chain[];
}

function chainsForTarget(
  adapter: LendingAdapter,
  target: string,
  chainFilter: string[],
): string[] {
  const requestedChains = chainFilter.length
    ? chainFilter
    : Object.keys(adapter.adapter);
  if (target === "latest") {
    return adapter.dataAvailability.current
      ? requestedChains.filter((chain) => adapter.adapter[chain])
      : [];
  }

  return requestedChains.filter((chain) => {
    const config = adapter.adapter[chain];
    return Boolean(config?.start && target >= config.start);
  });
}

function filterRecord<T>(
  record: Partial<Record<string, T>>,
  keys: string[],
): Partial<Record<string, T>> {
  return Object.fromEntries(
    keys
      .map((key) => [key, record[key]])
      .filter(([, value]) => value !== undefined),
  );
}

function stringifyBlockNumbers(
  blockNumbers: BlockNumberMap,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(blockNumbers).map(([chain, blockNumber]) => [
      chain,
      blockNumber?.toString() ?? "0",
    ]),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
