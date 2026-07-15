import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaService } from "../db/prisma.service";
import { MaterializerService } from "../materializer/materializer.service";

@Injectable()
export class LendingService {
  private readonly cacheBase = join(process.cwd(), "public", "data");
  private readonly memoryCache = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly hotCacheTtlMs = 60_000;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(MaterializerService)
    private readonly materializer: MaterializerService
  ) {}

  async cachedJson<T>(key: string, fallback?: () => Promise<T>, ttlMs = this.hotCacheTtlMs): Promise<T> {
    const cached = this.memoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    try {
      const content = await readFile(join(this.cacheBase, key), "utf8");
      const value = JSON.parse(content) as T;
      this.setMemoryCache(key, value, ttlMs);
      return value;
    } catch {
      if (fallback) {
        const value = await fallback();
        this.setMemoryCache(key, value, ttlMs);
        return value;
      }
      throw new NotFoundException(`Cache file ${key} has not been materialized yet`);
    }
  }

  async manifest() {
    return this.cachedJson("lending/manifest.json", async () => ({
      category: "lending",
      generatedAt: new Date().toISOString(),
      version: "unmaterialized",
      markets: 0,
      protocols: [],
      chains: [],
      baseUrl: "/data/lending",
      files: {}
    }));
  }

  async current() {
    const current = (await this.cachedJson("lending/current-lite.json", () => this.materializer.currentLiteMarkets())) as {
      data: Array<Record<string, unknown>>;
    };
    return {
      ...current,
      data: current.data.filter((row) => Number(row.totalSuppliedUsd ?? 0) > 0)
    };
  }

  async protocol(protocol: string) {
    const current = (await this.current()) as { generatedAt: string; data: Array<Record<string, unknown>> };
    return {
      generatedAt: current.generatedAt,
      status: "success",
      protocolSlug: protocol,
      data: current.data.filter((row) => row.protocolSlug === protocol)
    };
  }

  async protocolTimeseries(protocol: string, range: string, year?: string) {
    if (year) {
      const parsedYear = Number(year);
      if (!Number.isInteger(parsedYear) || parsedYear < 2020 || parsedYear > 2100) {
        throw new NotFoundException(`Invalid timeseries year ${year}`);
      }
      return this.cachedJson(`lending/protocols/${protocol}/timeseries-1d/${parsedYear}.json`, () =>
        this.materializer.protocolTimeseriesForYear(protocol, parsedYear)
      );
    }

    const parsedRange = rangeToDays(range);
    const rangeKey = parsedRange === "all" ? "all" : `${parsedRange}d`;
    return this.cachedJson(`lending/protocols/${protocol}/timeseries-${rangeKey}-1d.json`, () =>
      this.materializer.protocolTimeseries(protocol, parsedRange)
    );
  }

  async poolChart(protocol: string, marketId: string, range: string, year?: string) {
    if (year) {
      const parsedYear = Number(year);
      if (!Number.isInteger(parsedYear) || parsedYear < 2020 || parsedYear > 2100) {
        throw new NotFoundException(`Invalid chart year ${year}`);
      }
      return this.cachedJson(`lending/protocols/${protocol}/pools/${marketId}/chart-1d/${parsedYear}.json`, () =>
        this.materializer.marketChartForYear(marketId, parsedYear)
      );
    }

    const parsedRange = rangeToDays(range);
    const rangeKey = parsedRange === "all" ? "all" : `${parsedRange}d`;
    return this.cachedJson(`lending/protocols/${protocol}/pools/${marketId}/chart-${rangeKey}.json`, () =>
      this.materializer.marketChart(marketId, parsedRange)
    );
  }

  async poolTimeseries(protocol: string, marketId: string, range: string, year?: string) {
    return this.poolChart(protocol, marketId, range, year);
  }

  async chain(chain: string) {
    const current = (await this.current()) as { generatedAt: string; data: Array<Record<string, unknown>> };
    return {
      generatedAt: current.generatedAt,
      status: "success",
      data: current.data.filter((row) => row.chain === chain)
    };
  }

  async asset(asset: string) {
    const normalizedAsset = asset.toLowerCase();
    const current = (await this.current()) as { generatedAt: string; data: Array<Record<string, unknown>> };
    return {
      generatedAt: current.generatedAt,
      status: "success",
      data: current.data.filter((row) => String(row.assetSymbol).toLowerCase() === normalizedAsset)
    };
  }

  async history(marketId: string, range: string) {
    return this.materializer.marketHistory(marketId, rangeToDays(range));
  }

  async quality() {
    return this.cachedJson("lending/quality.json", () => this.materializer.qualitySummary());
  }

  async anomalies() {
    const quality = await this.quality();
    return {
      generatedAt: new Date().toISOString(),
      status: "success",
      data: (quality as { checks: Array<{ status: string }> }).checks.filter((check) => check.status !== "pass")
    };
  }

  async rankings(asset: string | undefined, sort: string | undefined) {
    const current = (await this.current()) as { generatedAt: string; data: Array<Record<string, unknown>> };
    const normalizedAsset = asset?.toLowerCase();
    const sortKey = sort ?? "supplyApy";
    const data = current.data
      .filter((row) => !normalizedAsset || String(row.assetSymbol).toLowerCase() === normalizedAsset)
      .sort((a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0));
    return { generatedAt: current.generatedAt, status: "success", data };
  }

  async source(marketId: string) {
    const snapshot = await this.prisma.marketSnapshot.findFirst({
      where: { marketId },
      orderBy: { timestamp: "desc" },
      include: { rawSnapshot: true, qualityChecks: true }
    });
    if (!snapshot) {
      throw new NotFoundException(`No source data found for ${marketId}`);
    }
    return {
      marketId,
      timestamp: snapshot.timestamp.toISOString(),
      source: {
        method: snapshot.sourceMethod,
        payloadHash: snapshot.sourcePayloadHash,
        contracts: snapshot.sourceContracts,
        rawSnapshotId: snapshot.rawSnapshotId,
        rawPayload: snapshot.rawSnapshot.payloadJson
      },
      qualityChecks: snapshot.qualityChecks
    };
  }

  private setMemoryCache<T>(key: string, value: T, ttlMs: number) {
    this.memoryCache.set(key, {
      expiresAt: Date.now() + ttlMs,
      value
    });
  }
}

function rangeToDays(range: string): number | "all" {
  if (range === "all" || range === "max" || range === "full") return "all";
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  if (range === "1y" || range === "365d" || range === "year") return 365;
  return 30;
}
