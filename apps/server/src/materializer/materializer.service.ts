import { Inject, Injectable, Logger } from "@nestjs/common";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { sha256 } from "@stablewatch-lending/core";
import { Prisma } from "@stablewatch-lending/db";
import { PrismaService } from "../db/prisma.service";
import { R2StorageService } from "./r2-storage.service";
import { envInt, mapWithConcurrency } from "../utils/concurrency";

type CacheFile = {
  key: string;
  body: string;
};

type CurrentMarketRow = {
  marketId: string;
  protocol: string;
  protocolSlug: string;
  chain: string;
  marketType: string;
  assetSymbol: string;
  assetAddress: string;
  supplyApy: number | null;
  borrowApy: number | null;
  rewardSupplyApy: number | null;
  rewardBorrowApy: number | null;
  netSupplyApy: number | null;
  totalSuppliedUsd: number | null;
  totalBorrowedUsd: number | null;
  availableLiquidityUsd: number | null;
  utilization: number | null;
  ltv: number | null;
  liquidationThreshold: number | null;
  reserveFactor: number | null;
  supplyCapUsd: number | null;
  borrowCapUsd: number | null;
  isActive: boolean;
  isPaused: boolean;
  dataQualityScore: number;
  lastUpdated: string;
  source: {
    method: string;
    payloadHash: string;
    contracts: unknown;
  };
};

type DailySnapshotRow = {
  marketId: string;
  date: string;
  timestamp: string;
  blockNumber: number;
  protocol: string;
  protocolSlug: string;
  chain: string;
  marketType: string;
  assetSymbol: string;
  assetAddress: string;
  supplyApy: number | null;
  borrowApy: number | null;
  rewardSupplyApy: number | null;
  rewardBorrowApy: number | null;
  netSupplyApy: number | null;
  totalSuppliedUsd: number | null;
  totalBorrowedUsd: number | null;
  availableLiquidityUsd: number | null;
  utilization: number | null;
  dataQualityScore: number;
  isActive: boolean;
  isPaused: boolean;
};

type SnapshotLike = {
  marketId: string;
  date?: Date;
  timestamp: Date;
  blockNumber: number;
  protocol: string;
  adapterId: string;
  chain: string;
  marketType: string;
  assetSymbol: string;
  assetAddress: string;
  supplyApy: number | null;
  borrowApy: number | null;
  rewardSupplyApy: number | null;
  rewardBorrowApy: number | null;
  netSupplyApy: number | null;
  totalSuppliedUsd: number | null;
  totalBorrowedUsd: number | null;
  availableLiquidityUsd: number | null;
  utilization: number | null;
  dataQualityScore: number;
  isActive: boolean;
  isPaused: boolean;
};

type CurrentDailySnapshotRow = SnapshotLike & {
  ltv: number | null;
  liquidationThreshold: number | null;
  reserveFactor: number | null;
  supplyCapUsd: number | null;
  borrowCapUsd: number | null;
  sourceMethod: string;
  sourcePayloadHash: string;
  sourceContracts: unknown;
};

const TIMESERIES_METRICS = [
  "blockNumber",
  "supplyApy",
  "borrowApy",
  "rewardSupplyApy",
  "rewardBorrowApy",
  "netSupplyApy",
  "totalSuppliedUsd",
  "totalBorrowedUsd",
  "availableLiquidityUsd",
  "utilization",
  "dataQualityScore",
  "isActive",
  "isPaused"
] as const;

const CHART_METRICS = [
  "tvlUsd",
  "apy",
  "apyBase",
  "apyReward",
  "borrowApy",
  "rewardBorrowApy",
  "netSupplyApy",
  "totalBorrowedUsd",
  "availableLiquidityUsd",
  "utilization",
  "dataQualityScore",
  "blockNumber",
  "isActive",
  "isPaused"
] as const;

@Injectable()
export class MaterializerService {
  private readonly logger = new Logger(MaterializerService.name);
  private readonly localBase = join(process.cwd(), "public", "data");

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(R2StorageService)
    private readonly r2: R2StorageService
  ) {}

  async materialize(): Promise<{ runId: string; files: number }> {
    const version = new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "");
    const runId = `mat_${new Date().toISOString()}_${randomUUID().slice(0, 8)}`;

    await this.prisma.materializationRun.create({
      data: { id: runId, status: "running", version }
    });

    try {
      const files = await this.buildFiles(version);
      await mapWithConcurrency(files, envInt("MATERIALIZER_CONCURRENCY", 8), async (file) => {
        await this.materializeFile(file, runId);
      });

      await this.prisma.materializationRun.update({
        where: { id: runId },
        data: { status: "success", finishedAt: new Date() }
      });

      this.logger.log(`Materialization ${runId} complete: ${files.length} files`);
      return { runId, files: files.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.materializationRun.update({
        where: { id: runId },
        data: { status: "failed", finishedAt: new Date(), error: message }
      });
      throw error;
    }
  }

  private async buildFiles(version: string): Promise<CacheFile[]> {
    const current = await this.currentMarkets();
    const quality = await this.qualitySummary();
    const anomalies = quality.checks.filter((check) => check.status !== "pass");
    const generatedAt = new Date().toISOString();
    const protocols = [...new Set(current.data.map((row) => row.protocolSlug))];
    const chains = [...new Set(current.data.map((row) => row.chain))];
    const assets = [...new Set(current.data.map((row) => row.assetSymbol.toLowerCase()))];
    const publicBaseUrl = this.r2.getPublicBaseUrl();

    const files: CacheFile[] = [
      jsonFile("lending/current.json", current),
      jsonFile("lending/quality.json", quality),
      jsonFile("lending/anomalies.json", { generatedAt, status: "success", data: anomalies })
    ];

    for (const protocol of protocols) {
      const protocolCurrent = {
        generatedAt,
        status: "success",
        protocolSlug: protocol,
        data: current.data.filter((row) => row.protocolSlug === protocol)
      };
      const years = await this.protocolYears(protocol);
      const protocolManifest = {
        generatedAt,
        status: "success",
        protocolSlug: protocol,
        granularity: "1d",
        markets: protocolCurrent.data.length,
        actualRange: await this.protocolActualRange(protocol),
        files: {
          current: `lending/protocols/${protocol}/current.json`,
          poolCurrent: `lending/protocols/${protocol}/pools/{marketId}/current.json`,
          poolChart30d: `lending/protocols/${protocol}/pools/{marketId}/chart-30d.json`,
          poolChartYear: `lending/protocols/${protocol}/pools/{marketId}/chart-1d/{year}.json`
        },
        years,
        metrics: CHART_METRICS
      };
      files.push(jsonFile(`lending/protocols/${protocol}/current.json`, protocolCurrent));
      for (const row of protocolCurrent.data) {
        files.push(jsonFile(`lending/protocols/${protocol}/pools/${row.marketId}/current.json`, { generatedAt, status: "success", data: row }));
        files.push(jsonFile(`lending/protocols/${protocol}/pools/${row.marketId}/chart-30d.json`, await this.marketChart(row.marketId, 30)));
        const poolYears = await this.marketYears(row.marketId);
        for (const year of poolYears) {
          files.push(jsonFile(`lending/protocols/${protocol}/pools/${row.marketId}/chart-1d/${year}.json`, await this.marketChartForYear(row.marketId, year)));
        }
      }
      files.push(jsonFile(`lending/protocols/${protocol}/manifest.json`, protocolManifest));
      files.push(jsonFile(`lending/protocols/${protocol}.json`, protocolCurrent));
    }

    for (const chain of chains) {
      files.push(jsonFile(`lending/chains/${chain}.json`, { generatedAt, status: "success", data: current.data.filter((row) => row.chain === chain) }));
    }

    for (const asset of assets) {
      files.push(jsonFile(`lending/assets/${asset}.json`, { generatedAt, status: "success", data: current.data.filter((row) => row.assetSymbol.toLowerCase() === asset) }));
    }

    const protocolFiles = Object.fromEntries(
      protocols.map((protocol) => [
        protocol,
        {
          manifest: `protocols/${protocol}/manifest.json`,
          current: `protocols/${protocol}/current.json`,
          poolCurrent: `protocols/${protocol}/pools/{marketId}/current.json`,
          poolChart30d: `protocols/${protocol}/pools/{marketId}/chart-30d.json`,
          poolChartYear: `protocols/${protocol}/pools/{marketId}/chart-1d/{year}.json`
        }
      ])
    );
    const manifest = {
      category: "lending",
      generatedAt,
      version,
      markets: current.data.length,
      protocols,
      chains,
      baseUrl: publicBaseUrl ? `${publicBaseUrl}/lending` : "/data/lending",
      files: {
        current: "current.json",
        quality: "quality.json",
        anomalies: "anomalies.json",
        protocols: protocolFiles
      }
    };
    files.push(jsonFile("lending/manifest.json", manifest));

    return files;
  }

  private async materializeFile(file: CacheFile, runId: string) {
    await this.writeLocal(file.key, file.body);
    const contentHash = sha256(JSON.parse(file.body));
    const previousObject = await this.prisma.r2Object.findFirst({
      where: { key: file.key },
      orderBy: { generatedAt: "desc" }
    });
    const upload = previousObject?.contentHash === contentHash
      ? { etag: previousObject.etag ?? undefined, publicUrl: previousObject.publicUrl ?? undefined }
      : await this.r2.uploadJson(file.key, file.body);
    await this.prisma.r2Object.create({
      data: {
        key: file.key,
        etag: upload?.etag,
        contentHash,
        contentType: "application/json",
        byteSize: Buffer.byteLength(file.body),
        materializationRunId: runId,
        publicUrl: upload?.publicUrl
      }
    });
  }

  async currentMarkets(): Promise<{ generatedAt: string; status: "success"; data: CurrentMarketRow[] }> {
    const latest = await this.prisma.$queryRaw<CurrentDailySnapshotRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("marketId")
        "marketId",
        "timestamp",
        "blockNumber",
        "protocol",
        "adapterId",
        "chain",
        "marketType",
        "assetSymbol",
        "assetAddress",
        "supplyApy",
        "borrowApy",
        "rewardSupplyApy",
        "rewardBorrowApy",
        "netSupplyApy",
        "totalSuppliedUsd",
        "totalBorrowedUsd",
        "availableLiquidityUsd",
        "utilization",
        "ltv",
        "liquidationThreshold",
        "reserveFactor",
        "supplyCapUsd",
        "borrowCapUsd",
        "isActive",
        "isPaused",
        "dataQualityScore",
        "sourcePayloadHash",
        "sourceMethod",
        "sourceContracts"
      FROM "DailyMarketSnapshot"
      ORDER BY "marketId", "date" DESC, "timestamp" DESC
    `);

    return {
      generatedAt: new Date().toISOString(),
      status: "success",
      data: latest.map((snapshot) => ({
        marketId: snapshot.marketId,
        protocol: snapshot.protocol,
        protocolSlug: snapshot.adapterId,
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
        dataQualityScore: snapshot.dataQualityScore,
        lastUpdated: snapshot.timestamp.toISOString(),
        source: {
          method: snapshot.sourceMethod,
          payloadHash: snapshot.sourcePayloadHash,
          contracts: snapshot.sourceContracts
        }
      }))
    };
  }

  async marketHistory(marketId: string, days: number) {
    const since = rangeStart(days);
    const snapshots = await this.prisma.dailyMarketSnapshot.findMany({
      where: { marketId, date: { gte: since } },
      orderBy: { date: "asc" }
    });
    const rows = dailyRows(snapshots);

    return {
      generatedAt: new Date().toISOString(),
      status: "success",
      marketId,
      range: `${days}d`,
      granularity: "1d",
      data: rows.map((snapshot) => ({
        date: snapshot.date,
        timestamp: snapshot.timestamp,
        blockNumber: snapshot.blockNumber,
        supplyApy: snapshot.supplyApy,
        borrowApy: snapshot.borrowApy,
        rewardSupplyApy: snapshot.rewardSupplyApy,
        rewardBorrowApy: snapshot.rewardBorrowApy,
        netSupplyApy: snapshot.netSupplyApy,
        totalSuppliedUsd: snapshot.totalSuppliedUsd,
        totalBorrowedUsd: snapshot.totalBorrowedUsd,
        availableLiquidityUsd: snapshot.availableLiquidityUsd,
        utilization: snapshot.utilization,
        dataQualityScore: snapshot.dataQualityScore
      }))
    };
  }

  async protocolTimeseries(protocolSlug: string, days: number) {
    const since = rangeStart(days);
    const snapshots = await this.prisma.dailyMarketSnapshot.findMany({
      where: { adapterId: protocolSlug, date: { gte: since } },
      orderBy: { date: "asc" }
    });
    return timeseriesPayload({
      generatedAt: new Date().toISOString(),
      scope: "protocol",
      scopeId: protocolSlug,
      days,
      snapshots
    });
  }

  async marketTimeseries(marketId: string, days: number) {
    const since = rangeStart(days);
    const snapshots = await this.prisma.dailyMarketSnapshot.findMany({
      where: { marketId, date: { gte: since } },
      orderBy: { date: "asc" }
    });
    return timeseriesPayload({
      generatedAt: new Date().toISOString(),
      scope: "market",
      scopeId: marketId,
      days,
      snapshots
    });
  }

  async marketChart(marketId: string, days: number) {
    const since = rangeStart(days);
    const snapshots = await this.prisma.dailyMarketSnapshot.findMany({
      where: { marketId, date: { gte: since } },
      orderBy: { date: "asc" }
    });
    return chartPayload({
      generatedAt: new Date().toISOString(),
      marketId,
      days,
      snapshots
    });
  }

  async marketTimeseriesForYear(marketId: string, year: number) {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const snapshots = await this.prisma.dailyMarketSnapshot.findMany({
      where: {
        marketId,
        date: {
          gte: start,
          lt: end
        }
      },
      orderBy: { date: "asc" }
    });
    return timeseriesPayload({
      generatedAt: new Date().toISOString(),
      scope: "market",
      scopeId: marketId,
      dates: yearDates(year),
      snapshots
    });
  }

  async marketChartForYear(marketId: string, year: number) {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const snapshots = await this.prisma.dailyMarketSnapshot.findMany({
      where: {
        marketId,
        date: {
          gte: start,
          lt: end
        }
      },
      orderBy: { date: "asc" }
    });
    return chartPayload({
      generatedAt: new Date().toISOString(),
      marketId,
      dates: yearDates(year),
      snapshots
    });
  }

  async protocolTimeseriesForYear(protocolSlug: string, year: number) {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const snapshots = await this.prisma.dailyMarketSnapshot.findMany({
      where: {
        adapterId: protocolSlug,
        date: {
          gte: start,
          lt: end
        }
      },
      orderBy: { date: "asc" }
    });
    return timeseriesPayload({
      generatedAt: new Date().toISOString(),
      scope: "protocol",
      scopeId: protocolSlug,
      dates: yearDates(year),
      snapshots
    });
  }

  private async protocolYears(protocolSlug: string): Promise<number[]> {
    const rows = await this.prisma.dailyMarketSnapshot.findMany({
      where: { adapterId: protocolSlug },
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "asc" }
    });
    return [...new Set(rows.map((row) => row.date.getUTCFullYear()))];
  }

  private async marketYears(marketId: string): Promise<number[]> {
    const rows = await this.prisma.dailyMarketSnapshot.findMany({
      where: { marketId },
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "asc" }
    });
    return [...new Set(rows.map((row) => row.date.getUTCFullYear()))];
  }

  private async protocolActualRange(protocolSlug: string) {
    const rows = await this.prisma.dailyMarketSnapshot.findMany({
      where: { adapterId: protocolSlug },
      select: { date: true },
      orderBy: { date: "asc" }
    });
    return {
      from: rows[0]?.date.toISOString().slice(0, 10) ?? null,
      to: rows[rows.length - 1]?.date.toISOString().slice(0, 10) ?? null
    };
  }

  async qualitySummary() {
    const checks = await this.prisma.qualityCheck.findMany({
      orderBy: { createdAt: "desc" },
      take: 500
    });
    return {
      generatedAt: new Date().toISOString(),
      status: "success",
      checks: checks.map((check) => ({
        id: check.id,
        marketId: check.marketId,
        snapshotId: check.snapshotId,
        checkName: check.checkName,
        status: check.status,
        severity: check.severity,
        message: check.message,
        observedValue: check.observedValue,
        expectedValue: check.expectedValue,
        createdAt: check.createdAt.toISOString()
      }))
    };
  }

  private async writeLocal(key: string, body: string) {
    const path = join(this.localBase, key);
    const tmp = `${path}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    JSON.parse(body);
    await writeFile(tmp, body);
    await rename(tmp, path);
  }
}

function jsonFile(key: string, value: unknown): CacheFile {
  return {
    key,
    body: `${JSON.stringify(value, null, 2)}\n`
  };
}

function rangeStart(days: number): Date {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days + 1));
}

function rangeDates(days: number): string[] {
  const start = rangeStart(days);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function yearDates(year: number): string[] {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const dates: string[] = [];
  for (const date = new Date(start); date < end; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

function dailyRows(snapshots: SnapshotLike[]): DailySnapshotRow[] {
  const byMarketDate = new Map<string, DailySnapshotRow>();
  for (const snapshot of snapshots) {
    const row = dailyRow(snapshot);
    const key = `${row.marketId}:${row.date}`;
    const existing = byMarketDate.get(key);
    if (!existing || Date.parse(row.timestamp) > Date.parse(existing.timestamp)) {
      byMarketDate.set(key, row);
    }
  }
  return [...byMarketDate.values()].sort((a, b) => a.date.localeCompare(b.date) || a.marketId.localeCompare(b.marketId));
}

function dailyRow(snapshot: SnapshotLike): DailySnapshotRow {
  return {
    marketId: snapshot.marketId,
    date: (snapshot.date ?? snapshot.timestamp).toISOString().slice(0, 10),
    timestamp: snapshot.timestamp.toISOString(),
    blockNumber: snapshot.blockNumber,
    protocol: snapshot.protocol,
    protocolSlug: snapshot.adapterId,
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
    dataQualityScore: snapshot.dataQualityScore,
    isActive: snapshot.isActive,
    isPaused: snapshot.isPaused
  };
}

function chartPayload(args: {
  generatedAt: string;
  marketId: string;
  days?: number;
  dates?: string[];
  snapshots: SnapshotLike[];
}) {
  const requestedDates = args.dates ?? rangeDates(args.days ?? 30);
  const rows = dailyRows(args.snapshots).filter((row) => row.marketId === args.marketId);
  const first = rows[0];
  const last = rows[rows.length - 1];

  return {
    generatedAt: args.generatedAt,
    status: "success",
    marketId: args.marketId,
    protocol: last?.protocol ?? first?.protocol ?? null,
    protocolSlug: last?.protocolSlug ?? first?.protocolSlug ?? null,
    chain: last?.chain ?? first?.chain ?? null,
    assetSymbol: last?.assetSymbol ?? first?.assetSymbol ?? null,
    assetAddress: last?.assetAddress ?? first?.assetAddress ?? null,
    range: args.days ? `${args.days}d` : `${requestedDates[0] ?? "empty"}:${requestedDates[requestedDates.length - 1] ?? "empty"}`,
    granularity: "1d",
    requestedRange: {
      days: requestedDates.length,
      from: requestedDates[0] ?? null,
      to: requestedDates[requestedDates.length - 1] ?? null
    },
    actualRange: {
      from: first?.date ?? null,
      to: last?.date ?? null
    },
    data: rows.map((row) => ({
      timestamp: row.timestamp,
      date: row.date,
      tvlUsd: row.totalSuppliedUsd,
      apy: row.netSupplyApy ?? row.supplyApy,
      apyBase: row.supplyApy,
      apyReward: row.rewardSupplyApy,
      borrowApy: row.borrowApy,
      rewardBorrowApy: row.rewardBorrowApy,
      netSupplyApy: row.netSupplyApy,
      totalBorrowedUsd: row.totalBorrowedUsd,
      availableLiquidityUsd: row.availableLiquidityUsd,
      utilization: row.utilization,
      dataQualityScore: row.dataQualityScore,
      blockNumber: row.blockNumber,
      isActive: row.isActive,
      isPaused: row.isPaused
    }))
  };
}

function timeseriesPayload(args: {
  generatedAt: string;
  scope: "protocol" | "market";
  scopeId: string;
  days?: number;
  dates?: string[];
  snapshots: SnapshotLike[];
}) {
  const timestamps = args.dates ?? rangeDates(args.days ?? 30);
  const rows = dailyRows(args.snapshots);
  const rowsByMarket = new Map<string, Map<string, DailySnapshotRow>>();
  for (const row of rows) {
    const marketRows = rowsByMarket.get(row.marketId) ?? new Map<string, DailySnapshotRow>();
    marketRows.set(row.date, row);
    rowsByMarket.set(row.marketId, marketRows);
  }

  const marketIds = [...rowsByMarket.keys()].sort();
  const markets = marketIds.map((marketId) => {
    const marketRowsByDate = rowsByMarket.get(marketId) ?? new Map<string, DailySnapshotRow>();
    const marketRows = [...marketRowsByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const first = marketRows[0];
    const last = marketRows[marketRows.length - 1];
    const series = Object.fromEntries(
      TIMESERIES_METRICS.map((metric) => [
        metric,
        timestamps.map((date) => marketRowsByDate.get(date)?.[metric] ?? null)
      ])
    );

    return {
      marketId,
      protocol: last?.protocol ?? first?.protocol,
      protocolSlug: last?.protocolSlug ?? first?.protocolSlug,
      chain: last?.chain ?? first?.chain,
      marketType: last?.marketType ?? first?.marketType,
      assetSymbol: last?.assetSymbol ?? first?.assetSymbol,
      assetAddress: last?.assetAddress ?? first?.assetAddress,
      firstAvailableDate: first?.date ?? null,
      lastAvailableDate: last?.date ?? null,
      series
    };
  });

  const actualDates = rows.map((row) => row.date).sort();
  return {
    generatedAt: args.generatedAt,
    status: "success",
    scope: args.scope,
    scopeId: args.scopeId,
    range: args.days ? `${args.days}d` : `${timestamps[0] ?? "empty"}:${timestamps[timestamps.length - 1] ?? "empty"}`,
    granularity: "1d",
    requestedRange: {
      days: timestamps.length,
      from: timestamps[0] ?? null,
      to: timestamps[timestamps.length - 1] ?? null
    },
    actualRange: {
      from: actualDates[0] ?? null,
      to: actualDates[actualDates.length - 1] ?? null
    },
    timestamps,
    metrics: TIMESERIES_METRICS,
    markets
  };
}
