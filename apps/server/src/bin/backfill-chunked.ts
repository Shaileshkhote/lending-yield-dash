import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { createPublicClient, http, type PublicClient } from "viem";
import { AppModule } from "../app.module";
import { loadEnv } from "../config/env";
import { PrismaService } from "../db/prisma.service";
import { SnapshotPersistenceService } from "../ingestion/snapshot-persistence.service";
import { envInt, mapWithConcurrency, shuffle } from "../utils/concurrency";
import { runQualityChecks, scoreQuality } from "@stablewatch-lending/quality";
import {
  isSupportedChain,
  lendingAdapters,
  normalizeChain,
  rpcCandidatesForChain,
  SUPPORTED_CHAINS,
  type Chain,
  type LendingAdapter,
} from "@stablewatch-lending/adapters";
import type {
  AdapterContext,
  CanonicalMarketSnapshot,
  RawMarketSnapshot,
} from "@stablewatch-lending/core";

type RpcCandidateMap = Partial<Record<Chain, string[]>>;
type BlockNumberMap = Partial<Record<string, bigint>>;

type ChunkWorkItem = {
  adapter: LendingAdapter;
  chain: string;
  dates: string[];
};

type ChunkSummary = {
  chunk: string;
  adapter: string;
  chain: string;
  dates: number;
  skipped: number;
  markets: number;
  snapshots: number;
  updated: number;
  checks: number;
  errors: Array<{ date?: string; marketId?: string; message: string }>;
};

type ParsedArgs = {
  from?: string;
  to?: string;
  fromFirstData: boolean;
  monthsBack: number;
  chunkDays: number;
};

loadEnv();

process.env.DISABLE_SCHEDULER ??= "1";

const CHUNK_CONCURRENCY = envInt("BACKFILL_CHUNK_CONCURRENCY", 4);
const DATE_CONCURRENCY = envInt("BACKFILL_DATE_CONCURRENCY", 2);
const WRITE_CONCURRENCY = envInt(
  "BACKFILL_WRITE_CONCURRENCY",
  envInt("BACKFILL_MARKET_CONCURRENCY", 8),
);
const MARKET_RETRIES = envInt("BACKFILL_MARKET_RETRIES", 3);
const BLOCK_RETRIES = envInt("BACKFILL_BLOCK_RETRIES", 4);
const DATE_SLEEP_MS = envNonNegativeInt("BACKFILL_DATE_SLEEP_MS", 0);
const CHUNK_SLEEP_MS = envNonNegativeInt("BACKFILL_CHUNK_SLEEP_MS", 0);
const FORCE_BACKFILL = process.env.BACKFILL_FORCE === "1";
const SHUFFLE_WORK = process.env.BACKFILL_SHUFFLE !== "0";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const adapterFilter = csvEnv("HISTORY_ADAPTERS");
  const chainFilter = csvEnv("HISTORY_CHAINS").map(normalizeChain);
  const assetFilter = csvEnv("HISTORY_ASSETS").map((asset) =>
    asset.toLowerCase(),
  );
  const blockRequiredAdapters = csvEnvWithDefault(
    "BACKFILL_BLOCK_REQUIRED_ADAPTERS",
    ["aave-v3"],
  );
  const rpcCandidates = selectedRpcCandidates();
  const rpcUrls = Object.fromEntries(
    Object.entries(rpcCandidates).map(([chain, urls]) => [
      chain,
      urls?.join(","),
    ]),
  );
  const blockCache = new Map<string, Promise<bigint>>();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  const prisma = app.get(PrismaService);
  const persistence = app.get(SnapshotPersistenceService);

  try {
    const range = await resolveRange(prisma, args);
    const dates = datesBetween(range.from, range.to);
    const selectedAdapters = lendingAdapters.filter(
      (adapter) =>
        !adapterFilter.length || adapterFilter.includes(adapter.id),
    );
    const workItems = buildWorkItems(
      selectedAdapters,
      dates,
      args.chunkDays,
      chainFilter,
    );
    const runnableWorkItems = SHUFFLE_WORK ? shuffle(workItems) : workItems;
    const summaries: ChunkSummary[] = [];

    console.log(
      `[chunked-backfill] range=${range.from}..${range.to} dates=${dates.length} chunkDays=${args.chunkDays} chunks=${runnableWorkItems.length} chunkConcurrency=${CHUNK_CONCURRENCY} dateConcurrency=${DATE_CONCURRENCY} writeConcurrency=${WRITE_CONCURRENCY} dateSleepMs=${DATE_SLEEP_MS} chunkSleepMs=${CHUNK_SLEEP_MS}`,
    );

    await mapWithConcurrency(
      runnableWorkItems,
      CHUNK_CONCURRENCY,
      async (item) => {
        const summary = await runChunk({
          item,
          prisma,
          persistence,
          rpcCandidates,
          rpcUrls,
          blockCache,
          blockRequired:
            blockRequiredAdapters.includes("*") ||
            blockRequiredAdapters.includes(item.adapter.id),
          assetFilter,
        });
        summaries.push(summary);
      },
    );

    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          range,
          filters: {
            adapters: adapterFilter,
            chains: chainFilter,
            assets: assetFilter,
            blockRequiredAdapters,
          },
          totals: {
            chunks: summaries.length,
            dates: summaries.reduce((sum, item) => sum + item.dates, 0),
            skipped: summaries.reduce((sum, item) => sum + item.skipped, 0),
            markets: summaries.reduce((sum, item) => sum + item.markets, 0),
            snapshots: summaries.reduce(
              (sum, item) => sum + item.snapshots,
              0,
            ),
            updated: summaries.reduce((sum, item) => sum + item.updated, 0),
            checks: summaries.reduce((sum, item) => sum + item.checks, 0),
            errors: summaries.reduce(
              (sum, item) => sum + item.errors.length,
              0,
            ),
          },
          chunks: summaries.sort((a, b) =>
            `${a.chunk}:${a.adapter}:${a.chain}`.localeCompare(
              `${b.chunk}:${b.adapter}:${b.chain}`,
            ),
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

async function runChunk(args: {
  item: ChunkWorkItem;
  prisma: PrismaService;
  persistence: SnapshotPersistenceService;
  rpcCandidates: RpcCandidateMap;
  rpcUrls: Record<string, string | undefined>;
  blockCache: Map<string, Promise<bigint>>;
  blockRequired: boolean;
  assetFilter: string[];
}): Promise<ChunkSummary> {
  const {
    item,
    prisma,
    persistence,
    rpcCandidates,
    rpcUrls,
    blockCache,
    blockRequired,
    assetFilter,
  } = args;
  const chunk = `${item.dates[0]}..${item.dates.at(-1)}`;
  const summary: ChunkSummary = {
    chunk,
    adapter: item.adapter.id,
    chain: item.chain,
    dates: item.dates.length,
    skipped: 0,
    markets: 0,
    snapshots: 0,
    updated: 0,
    checks: 0,
    errors: [],
  };
  const missingDates = FORCE_BACKFILL
    ? item.dates
    : await missingDailyDates(prisma, item);

  summary.skipped = item.dates.length - missingDates.length;
  if (!missingDates.length) {
    console.log(
      `[chunked-backfill] ${chunk} ${item.adapter.id} ${item.chain} skipped: already stored`,
    );
    return summary;
  }

  console.log(
    `[chunked-backfill] ${chunk} ${item.adapter.id} ${item.chain} fetching ${missingDates.length}/${item.dates.length} missing dates`,
  );

  await mapWithConcurrency(missingDates, DATE_CONCURRENCY, async (date) => {
    await runDate({
      date,
      item,
      prisma,
      persistence,
      rpcCandidates,
      rpcUrls,
      blockCache,
      blockRequired,
      assetFilter,
      summary,
    });
    if (DATE_SLEEP_MS > 0) {
      await sleep(DATE_SLEEP_MS);
    }
  });

  console.log(
    `[chunked-backfill] ${chunk} ${item.adapter.id} ${item.chain} done snapshots=${summary.snapshots} errors=${summary.errors.length}`,
  );
  if (CHUNK_SLEEP_MS > 0) {
    await sleep(CHUNK_SLEEP_MS);
  }
  return summary;
}

async function runDate(args: {
  date: string;
  item: ChunkWorkItem;
  prisma: PrismaService;
  persistence: SnapshotPersistenceService;
  rpcCandidates: RpcCandidateMap;
  rpcUrls: Record<string, string | undefined>;
  blockCache: Map<string, Promise<bigint>>;
  blockRequired: boolean;
  assetFilter: string[];
  summary: ChunkSummary;
}) {
  const {
    date,
    item,
    prisma,
    persistence,
    rpcCandidates,
    rpcUrls,
    blockCache,
    blockRequired,
    assetFilter,
    summary,
  } = args;

  try {
    const blockNumber = blockRequired
      ? await blockNumberForDateChain(
          date,
          item.chain,
          rpcCandidates,
          blockCache,
        )
      : undefined;
    const blockNumbers = blockNumber
      ? { [item.chain]: blockNumber }
      : ({} as BlockNumberMap);
    const runId = `chunked_${date}_${item.adapter.id}_${item.chain}_${randomUUID().slice(0, 8)}`;
    const ctx: AdapterContext = {
      runId,
      now: new Date(`${date}T00:00:00.000Z`),
      rpcUrls,
      blockNumbers,
      chains: [item.chain],
      assets: assetFilter,
    };
    const fetchResult = await retry(
      () =>
        item.adapter.fetch({
          ...ctx,
          chain: item.chain,
          blockNumber,
        }),
      MARKET_RETRIES,
    );
    summary.markets += fetchResult.markets.length;
    for (const itemError of fetchResult.errors ?? []) {
      summary.errors.push({
        date,
        marketId: itemError.marketId,
        message: itemError.message,
      });
    }

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
          const result = await persistCompactDailySnapshot(
            prisma,
            raw,
            canonical,
          );
          summary.snapshots += 1;
          summary.updated += result.created ? 0 : 1;
          summary.checks += result.checks;
          completed += 1;
          if (
            completed % 50 === 0 ||
            completed === fetchResult.rawPayloads.length
          ) {
            console.log(
              `[chunked-backfill] ${date} ${item.adapter.id} ${item.chain} ${completed}/${fetchResult.rawPayloads.length} snapshots=${summary.snapshots} errors=${summary.errors.length}`,
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
        date,
        marketId: raw.marketId,
        message: compactErrorMessage(lastError),
      });
    });
  } catch (error) {
    summary.errors.push({ date, message: compactErrorMessage(error) });
  }
}

async function persistCompactDailySnapshot(
  prisma: PrismaService,
  raw: RawMarketSnapshot,
  canonical: CanonicalMarketSnapshot,
): Promise<{ checks: number; created: boolean }> {
  const timestamp = new Date(canonical.timestamp);
  const date = startOfUtcDay(timestamp);
  const previous = await previousDailySnapshot(prisma, canonical.marketId, date);
  const qualityResults = runQualityChecks(canonical, previous ?? undefined);
  const dataQualityScore = scoreQuality(qualityResults);
  const existing = await prisma.dailyMarketSnapshot.findUnique({
    where: {
      marketId_date: {
        marketId: canonical.marketId,
        date,
      },
    },
    select: { id: true },
  });

  await prisma.dailyMarketSnapshot.upsert({
    where: {
      marketId_date: {
        marketId: canonical.marketId,
        date,
      },
    },
    update: compactDailySnapshotData(raw, canonical, timestamp, dataQualityScore),
    create: {
      marketId: canonical.marketId,
      date,
      ...compactDailySnapshotData(raw, canonical, timestamp, dataQualityScore),
    },
  });

  return { checks: qualityResults.length, created: !existing };
}

async function previousDailySnapshot(
  prisma: PrismaService,
  marketId: string,
  before: Date,
): Promise<CanonicalMarketSnapshot | null> {
  const previous = await prisma.dailyMarketSnapshot.findFirst({
    where: { marketId, date: { lt: before } },
    orderBy: { date: "desc" },
  });
  if (!previous) return null;
  return {
    timestamp: previous.timestamp.toISOString(),
    blockNumber: previous.blockNumber,
    protocol: previous.protocol,
    adapterId: previous.adapterId,
    chain: previous.chain,
    marketId: previous.marketId,
    marketType: previous.marketType as CanonicalMarketSnapshot["marketType"],
    assetSymbol: previous.assetSymbol,
    assetAddress: previous.assetAddress,
    supplyApy: previous.supplyApy,
    borrowApy: previous.borrowApy,
    rewardSupplyApy: previous.rewardSupplyApy,
    rewardBorrowApy: previous.rewardBorrowApy,
    netSupplyApy: previous.netSupplyApy,
    totalSuppliedUsd: previous.totalSuppliedUsd,
    totalBorrowedUsd: previous.totalBorrowedUsd,
    availableLiquidityUsd: previous.availableLiquidityUsd,
    utilization: previous.utilization,
    ltv: previous.ltv,
    liquidationThreshold: previous.liquidationThreshold,
    reserveFactor: previous.reserveFactor,
    supplyCapUsd: previous.supplyCapUsd,
    borrowCapUsd: previous.borrowCapUsd,
    isActive: previous.isActive,
    isPaused: previous.isPaused,
    dataQualityScore: previous.dataQualityScore,
    source: {
      rawSnapshotId: previous.rawSnapshotId,
      payloadHash: previous.sourcePayloadHash,
      method: previous.sourceMethod,
      contracts: previous.sourceContracts as string[],
    },
  };
}

function compactDailySnapshotData(
  raw: RawMarketSnapshot,
  snapshot: CanonicalMarketSnapshot,
  timestamp: Date,
  dataQualityScore: number,
) {
  return {
    timestamp,
    blockNumber: snapshot.blockNumber,
    protocol: snapshot.protocol,
    adapterId: snapshot.adapterId,
    chain: snapshot.chain,
    marketType: snapshot.marketType,
    assetSymbol: snapshot.assetSymbol,
    assetAddress: snapshot.assetAddress,
    supplyApy: snapshot.supplyApy,
    borrowApy: snapshot.borrowApy,
    rewardSupplyApy: snapshot.rewardSupplyApy,
    rewardBorrowApy: snapshot.rewardBorrowApy,
    netSupplyApy: snapshot.netSupplyApy,
    totalSuppliedUsd: snapshot.totalSuppliedUsd,
    totalBorrowedUsd: snapshot.totalBorrowedUsd,
    availableLiquidityUsd: snapshot.availableLiquidityUsd,
    utilization: snapshot.utilization,
    ltv: snapshot.ltv,
    liquidationThreshold: snapshot.liquidationThreshold,
    reserveFactor: snapshot.reserveFactor,
    supplyCapUsd: snapshot.supplyCapUsd,
    borrowCapUsd: snapshot.borrowCapUsd,
    isActive: snapshot.isActive,
    isPaused: snapshot.isPaused,
    dataQualityScore,
    sourcePayloadHash: snapshot.source.payloadHash || raw.payloadHash,
    sourceMethod: snapshot.source.method || raw.sourceMethod,
    sourceContracts: snapshot.source.contracts,
    rawSnapshotId: `compact_raw_${raw.payloadHash}`,
    snapshotId: `compact_snapshot_${snapshot.marketId}_${timestamp.toISOString().slice(0, 10)}`,
  };
}

async function missingDailyDates(
  prisma: PrismaService,
  item: ChunkWorkItem,
): Promise<string[]> {
  const existing = await prisma.dailyMarketSnapshot.findMany({
    where: {
      adapterId: item.adapter.id,
      chain: item.chain,
      date: {
        in: item.dates.map((date) => new Date(`${date}T00:00:00.000Z`)),
      },
    },
    select: { date: true },
    distinct: ["date"],
  });
  const stored = new Set(
    existing.map((item) => item.date.toISOString().slice(0, 10)),
  );
  return item.dates.filter((date) => !stored.has(date));
}

function buildWorkItems(
  adapters: LendingAdapter[],
  dates: string[],
  chunkDays: number,
  chainFilter: string[],
): ChunkWorkItem[] {
  const workItems: ChunkWorkItem[] = [];
  for (const adapter of adapters) {
    const requestedChains = chainFilter.length
      ? chainFilter
      : Object.keys(adapter.adapter);
    for (const chain of requestedChains) {
      const historyStart =
        adapter.dataAvailability.history?.startDateByChain[chain];
      if (!historyStart) continue;
      const chainDates = dates.filter((date) => date >= historyStart);
      for (const chunk of chunkDatesByMonth(chainDates, chunkDays)) {
        workItems.push({ adapter, chain, dates: chunk });
      }
    }
  }
  return workItems;
}

async function resolveRange(
  prisma: PrismaService,
  args: ParsedArgs,
): Promise<{ from: string; to: string; firstStoredDate?: string }> {
  if (args.fromFirstData) {
    const first = await prisma.dailyMarketSnapshot.findFirst({
      orderBy: { date: "asc" },
      select: { date: true },
    });
    if (!first) {
      throw new Error("Cannot use --from-first-data without stored snapshots.");
    }
    const firstStoredDate = first.date.toISOString().slice(0, 10);
    return {
      from: addUtcMonths(firstStoredDate, -args.monthsBack),
      to: addUtcDays(firstStoredDate, -1),
      firstStoredDate,
    };
  }
  if (!args.from || !args.to) {
    throw new Error(
      "Use --from=YYYY-MM-DD --to=YYYY-MM-DD or --from-first-data --months-back=3.",
    );
  }
  return { from: args.from, to: args.to };
}

function parseArgs(args: string[]): ParsedArgs {
  const normalized = args.filter((arg) => arg !== "--");
  const from = valueArg(normalized, "--from=");
  const to = valueArg(normalized, "--to=");
  const monthsBack = Number(valueArg(normalized, "--months-back=") ?? "3");
  const chunkDays = Number(valueArg(normalized, "--chunk-days=") ?? "7");
  const fromFirstData = normalized.includes("--from-first-data");

  if (!Number.isInteger(monthsBack) || monthsBack < 1) {
    throw new Error(`Invalid --months-back value ${monthsBack}.`);
  }
  if (!Number.isInteger(chunkDays) || chunkDays < 1 || chunkDays > 31) {
    throw new Error(`Invalid --chunk-days value ${chunkDays}.`);
  }
  for (const date of [from, to].filter(Boolean)) {
    assertDate(date as string);
  }
  if (from && to && from > to) {
    throw new Error(`Invalid range: --from ${from} is after --to ${to}.`);
  }

  return { from, to, fromFirstData, monthsBack, chunkDays };
}

async function blockNumberForDateChain(
  date: string,
  chain: string,
  rpcCandidates: RpcCandidateMap,
  blockCache: Map<string, Promise<bigint>>,
): Promise<bigint | undefined> {
  if (!isSupportedChain(chain)) return undefined;
  const urls = rpcCandidates[chain];
  if (!urls?.length) return undefined;
  const cacheKey = `${chain}:${date}`;
  let promise = blockCache.get(cacheKey);
  if (!promise) {
    promise = blockAtOrBeforeAny(urls, dateToUnix(date));
    blockCache.set(cacheKey, promise);
  }
  return promise;
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
          `[chunked-backfill] resolving ${timestamp.toString()} with ${url} attempt=${attempt}/${BLOCK_RETRIES}`,
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

function selectedRpcCandidates(): RpcCandidateMap {
  const entries = [...SUPPORTED_CHAINS].map((chain) => [
    chain,
    historicalRpcCandidatesForChain(chain),
  ]);
  return Object.fromEntries(entries) as RpcCandidateMap;
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

function chunkDatesByMonth(dates: string[], chunkDays: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const date of dates) {
    const month = date.slice(0, 7);
    const currentMonth = current[0]?.slice(0, 7);
    if (
      current.length &&
      (current.length >= chunkDays || currentMonth !== month)
    ) {
      chunks.push(current);
      current = [];
    }
    current.push(date);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function datesBetween(from: string, to: string): string[] {
  assertDate(from);
  assertDate(to);
  if (from > to) return [];
  const dates: string[] = [];
  for (let current = from; current <= to; current = addUtcDays(current, 1)) {
    dates.push(current);
  }
  return dates;
}

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addUtcMonths(date: string, months: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

function dateToUnix(date: string): bigint {
  return BigInt(Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 1000));
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
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

function csvEnv(envKey: string): string[] {
  return (
    process.env[envKey]
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function csvEnvWithDefault(envKey: string, fallback: string[]): string[] {
  const value = csvEnv(envKey);
  return value.length ? value : fallback;
}

function envNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function valueArg(args: string[], prefix: string): string | undefined {
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function assertDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date ${date}. Use YYYY-MM-DD.`);
  }
  if (Date.parse(`${date}T00:00:00.000Z`) > Date.now()) {
    throw new Error(`Cannot backfill future date ${date}.`);
  }
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

void main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
