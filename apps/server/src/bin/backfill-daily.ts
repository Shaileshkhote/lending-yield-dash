import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { createPublicClient, http, type PublicClient } from "viem";
import { AppModule } from "../app.module";
import { loadEnv } from "../config/env";
import { PrismaService } from "../db/prisma.service";
import { SnapshotPersistenceService } from "../ingestion/snapshot-persistence.service";
import { envInt, mapWithConcurrency, shuffle } from "../utils/concurrency";
import {
  isSupportedChain,
  lendingAdapters,
  normalizeChain,
  rpcCandidatesForChain,
  SUPPORTED_CHAINS,
  type LendingAdapter,
  type Chain,
} from "@stablewatch-lending/adapters";
import type { AdapterContext } from "@stablewatch-lending/core";

type RpcCandidateMap = Partial<Record<Chain, string[]>>;
type BlockNumberMap = Partial<Record<string, bigint>>;

type BackfillSummary = {
  date: string;
  runId: string;
  chainBlocks: Record<string, string>;
  workItems: number;
  markets: number;
  snapshots: number;
  updated: number;
  checks: number;
  skipped: number;
  errors: Array<{ adapter: string; marketId?: string; message: string }>;
};

type BackfillWorkItem = {
  adapter: LendingAdapter;
  chain: string;
};

loadEnv();

process.env.DISABLE_SCHEDULER ??= "1";

const BLOCK_CONCURRENCY = envInt("BACKFILL_BLOCK_CONCURRENCY", 4);
const WORK_CONCURRENCY = envInt(
  "BACKFILL_WORK_CONCURRENCY",
  envInt("BACKFILL_ADAPTER_CONCURRENCY", 3),
);
const WRITE_CONCURRENCY = envInt(
  "BACKFILL_WRITE_CONCURRENCY",
  envInt("BACKFILL_MARKET_CONCURRENCY", 8),
);
const MARKET_RETRIES = envInt("BACKFILL_MARKET_RETRIES", 3);
const BLOCK_RETRIES = envInt("BACKFILL_BLOCK_RETRIES", 4);
const WORK_SLEEP_MS = envNonNegativeInt(
  "BACKFILL_WORK_SLEEP_MS",
  envNonNegativeInt("BACKFILL_ADAPTER_SLEEP_MS", 0),
);
const FORCE_BACKFILL = process.env.BACKFILL_FORCE === "1";
const SHUFFLE_WORK = process.env.BACKFILL_SHUFFLE !== "0";

async function main() {
  const targets = parseTargets(process.argv.slice(2));
  const adapterFilter = csvEnv("HISTORY_ADAPTERS");
  const chainFilter = csvEnv("HISTORY_CHAINS").map(normalizeChain);
  const assetFilter = csvEnv("HISTORY_ASSETS").map((asset) =>
    asset.toLowerCase(),
  );
  const chains = selectedChains(chainFilter);
  const rpcCandidates = Object.fromEntries(
    chains.map((chain) => [chain, historicalRpcCandidatesForChain(chain)]),
  ) as RpcCandidateMap;
  const rpcUrls = Object.fromEntries(
    chains.map((chain) => [chain, rpcCandidates[chain]?.join(",")]),
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  const prisma = app.get(PrismaService);
  const persistence = app.get(SnapshotPersistenceService);
  const summaries: BackfillSummary[] = [];

  try {
    for (const target of targets) {
      const runId = `backfill_${target}_${randomUUID().slice(0, 8)}`;
      console.log(`[backfill] resolving blocks for ${target}`);
      const blockNumbers = await blockNumbersForTarget(target, rpcCandidates);
      console.log(
        `[backfill] ${target} blocks ${JSON.stringify(stringifyBlockNumbers(blockNumbers))}`,
      );
      const ctx: AdapterContext = {
        runId,
        now: new Date(`${target}T00:00:00.000Z`),
        rpcUrls,
        blockNumbers,
        chains: chainFilter,
        assets: assetFilter,
      };
      const summary: BackfillSummary = {
        date: target,
        runId,
        chainBlocks: stringifyBlockNumbers(blockNumbers),
        workItems: 0,
        markets: 0,
        snapshots: 0,
        updated: 0,
        checks: 0,
        skipped: 0,
        errors: [],
      };

      await prisma.ingestionRun.create({
        data: { id: runId, status: "running", startedAt: new Date() },
      });

      const selectedAdapters = lendingAdapters.filter(
        (adapter) =>
          !adapterFilter.length || adapterFilter.includes(adapter.id),
      );
      const workItems: BackfillWorkItem[] = [];
      for (const adapter of selectedAdapters) {
        const adapterChains = chainsForTarget(adapter, target, chainFilter);
        if (!adapterChains.length) {
          console.log(
            `[backfill] ${target} ${adapter.id} skipped: no daily history availability for selected chains/date`,
          );
          summary.skipped += 1;
          continue;
        }
        workItems.push(
          ...adapterChains.map((chain) => ({
            adapter,
            chain,
          })),
        );
      }
      const runnableWorkItems = SHUFFLE_WORK ? shuffle(workItems) : workItems;
      summary.workItems = runnableWorkItems.length;
      console.log(
        `[backfill] ${target} running ${runnableWorkItems.length} adapter-chain jobs with concurrency=${WORK_CONCURRENCY} writeConcurrency=${WRITE_CONCURRENCY}`,
      );

      await mapWithConcurrency(runnableWorkItems, WORK_CONCURRENCY, async (item) => {
        await runBackfillWorkItem({
          target,
          runId,
          ctx,
          blockNumbers,
          item,
          prisma,
          persistence,
          summary,
        });
      });

      await prisma.ingestionRun.update({
        where: { id: runId },
        data: {
          status: summary.errors.length ? "partial_success" : "success",
          finishedAt: new Date(),
          error: summary.errors.length
            ? JSON.stringify(summary.errors.slice(0, 10))
            : null,
        },
      });
      summaries.push(summary);
      console.log(JSON.stringify(summary));
    }
  } finally {
    await app.close();
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        filters: {
          adapters: adapterFilter,
          chains: chainFilter,
          assets: assetFilter,
        },
        rpcUrls,
        totals: {
          dates: summaries.length,
          workItems: summaries.reduce((sum, item) => sum + item.workItems, 0),
          snapshots: summaries.reduce((sum, item) => sum + item.snapshots, 0),
          updated: summaries.reduce((sum, item) => sum + item.updated, 0),
          checks: summaries.reduce((sum, item) => sum + item.checks, 0),
          skipped: summaries.reduce((sum, item) => sum + item.skipped, 0),
          errors: summaries.reduce((sum, item) => sum + item.errors.length, 0),
        },
        dates: summaries,
      },
      null,
      2,
    ),
  );
}

async function runBackfillWorkItem(args: {
  target: string;
  runId: string;
  ctx: AdapterContext;
  blockNumbers: BlockNumberMap;
  item: BackfillWorkItem;
  prisma: PrismaService;
  persistence: SnapshotPersistenceService;
  summary: BackfillSummary;
}) {
  const { target, runId, ctx, blockNumbers, item, prisma, persistence, summary } =
    args;
  const { adapter, chain } = item;

  try {
    if (!FORCE_BACKFILL && (await hasDailySnapshot(prisma, target, adapter.id, chain))) {
      summary.skipped += 1;
      console.log(`[backfill] ${target} ${adapter.id} ${chain} skipped: already stored`);
      return;
    }

    console.log(`[backfill] ${target} ${adapter.id} ${chain} fetching`);
    const fetchResult = await retry(
      () =>
        adapter.fetch({
          ...ctx,
          chain,
          chains: [chain],
          blockNumber: blockNumbers[chain],
          blockNumbers: filterRecord(blockNumbers, [chain]),
        }),
      MARKET_RETRIES,
    );
    summary.markets += fetchResult.markets.length;
    for (const itemError of fetchResult.errors ?? []) {
      summary.errors.push({
        adapter: adapter.id,
        marketId: itemError.marketId,
        message: itemError.message,
      });
    }
    console.log(
      `[backfill] ${target} ${adapter.id} ${chain} markets=${fetchResult.markets.length} snapshots=${fetchResult.snapshots.length} errors=${fetchResult.errors?.length ?? 0}`,
    );

    await mapWithConcurrency(fetchResult.markets, WRITE_CONCURRENCY, async (market) => {
      await persistence.persistMarket(market);
    });

    let completed = 0;
    await mapWithConcurrency(fetchResult.rawPayloads, WRITE_CONCURRENCY, async (raw, index) => {
      const canonical = fetchResult.snapshots[index];
      let lastError: unknown;
      for (let attempt = 1; attempt <= MARKET_RETRIES; attempt += 1) {
        try {
          if (!canonical) {
            throw new Error(`Missing canonical snapshot for ${raw.marketId}`);
          }
          const result = await persistence.persistSnapshot(runId, raw, canonical);
          summary.snapshots += 1;
          summary.updated += result.created ? 0 : 1;
          summary.checks += result.checks;
          completed += 1;
          if (
            completed % 25 === 0 ||
            completed === fetchResult.rawPayloads.length
          ) {
            console.log(
              `[backfill] ${target} ${adapter.id} ${chain} ${completed}/${fetchResult.rawPayloads.length} snapshots=${summary.snapshots} errors=${summary.errors.length}`,
            );
          }
          return;
        } catch (error) {
          lastError = error;
          if (attempt < MARKET_RETRIES) {
            await sleep(1_000 * attempt);
          }
        }
      }
      summary.errors.push({
        adapter: adapter.id,
        marketId: raw.marketId,
        message: compactErrorMessage(lastError),
      });
    });

    if (WORK_SLEEP_MS > 0) {
      await sleep(WORK_SLEEP_MS);
    }
  } catch (error) {
    summary.errors.push({
      adapter: adapter.id,
      message: `${chain}: ${errorMessage(error)}`,
    });
  }
}

function parseTargets(args: string[]): string[] {
  const normalized = args.filter((arg) => arg !== "--");
  const daysArg = normalized.find((arg) => arg.startsWith("--days="));
  const explicitTargets = normalized.filter(
    (arg) => !arg.startsWith("--days="),
  );
  const targets = explicitTargets.length
    ? explicitTargets
    : previousUtcDates(daysArg ? Number(daysArg.slice("--days=".length)) : 30);
  if (!targets.length) {
    throw new Error("No backfill dates selected.");
  }
  for (const target of targets) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
      throw new Error(`Invalid date ${target}. Use YYYY-MM-DD.`);
    }
    if (Date.parse(`${target}T00:00:00.000Z`) > Date.now()) {
      throw new Error(`Cannot backfill future date ${target}.`);
    }
  }
  return [...new Set(targets)].sort();
}

function previousUtcDates(count: number): string[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Invalid --days value ${count}.`);
  }
  const today = new Date();
  const dates: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
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
  for (let attempt = 1; attempt <= BLOCK_RETRIES; attempt += 1) {
    for (const url of urls) {
      try {
        console.log(
          `[backfill] resolving ${timestamp.toString()} with ${url} attempt=${attempt}/${BLOCK_RETRIES}`,
        );
        return await blockAtOrBefore(createClient(url), timestamp);
      } catch (error) {
        errors.push(`${url}: ${compactErrorMessage(error)}`);
      }
    }
    if (attempt < BLOCK_RETRIES) {
      await sleep(2_000 * attempt);
    }
  }
  throw new Error(
    `No RPC could resolve block for ${timestamp.toString()}: ${errors.join(" | ")}`,
  );
}

function createClient(url: string): PublicClient {
  return createPublicClient({
    transport: http(url, { timeout: 20_000, retryCount: 1 }),
  });
}

async function blockNumbersForTarget(
  target: string,
  rpcCandidates: RpcCandidateMap,
): Promise<BlockNumberMap> {
  const blockNumbers: BlockNumberMap = {};
  const entries = Object.entries(rpcCandidates) as Array<[Chain, string[]]>;
  await mapWithConcurrency(entries, BLOCK_CONCURRENCY, async ([chain, urls]) => {
    blockNumbers[chain] = await blockAtOrBeforeAny(urls, dateToUnix(target));
  });
  return blockNumbers;
}

async function hasDailySnapshot(
  prisma: PrismaService,
  target: string,
  adapterId: string,
  chain: string,
): Promise<boolean> {
  const date = new Date(`${target}T00:00:00.000Z`);
  const existing = await prisma.dailyMarketSnapshot.findFirst({
    where: { adapterId, chain, date },
    select: { id: true },
  });
  return Boolean(existing);
}

function csvEnv(envKey: string): string[] {
  return (
    process.env[envKey]
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
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
  return requestedChains.filter((chain) => {
    const config = adapter.adapter[chain];
    return Boolean(config?.start && target >= config.start);
  });
}

async function retry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(1_000 * attempt);
      }
    }
  }
  throw lastError;
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

function historicalRpcCandidatesForChain(chain: Chain): string[] {
  const candidates = rpcCandidatesForChain(chain);
  const historicalCandidates = candidates.filter((url) => {
    if (url.includes("flashbots")) return false;
    if (url.includes("cloudflare-eth.com")) return false;
    return true;
  });
  return historicalCandidates.length ? historicalCandidates : candidates;
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

function compactErrorMessage(error: unknown): string {
  const message = errorMessage(error);
  const detail = message.match(/Details: ([^\n]+)/)?.[1];
  const url = message.match(/URL: ([^\n]+)/)?.[1];
  if (detail && url) return `${detail} (${url})`;
  if (detail) return detail;
  return message.split("\n")[0] ?? message;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

void main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
