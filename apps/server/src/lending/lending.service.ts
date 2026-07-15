import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaService } from "../db/prisma.service";
import { MaterializerService } from "../materializer/materializer.service";

@Injectable()
export class LendingService {
  private readonly cacheBase = join(process.cwd(), "public", "data");

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(MaterializerService)
    private readonly materializer: MaterializerService
  ) {}

  async cachedJson<T>(key: string, fallback?: () => Promise<T>): Promise<T> {
    try {
      const content = await readFile(join(this.cacheBase, key), "utf8");
      return JSON.parse(content) as T;
    } catch {
      if (fallback) {
        return fallback();
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
    return this.cachedJson("lending/current.json", () => this.materializer.currentMarkets());
  }

  async protocol(protocol: string) {
    return this.cachedJson(`lending/protocols/${protocol}/current.json`, async () => {
      const current = (await this.current()) as { data: Array<Record<string, unknown>> };
      return {
        generatedAt: new Date().toISOString(),
        status: "success",
        protocolSlug: protocol,
        data: current.data.filter((row) => row.protocolSlug === protocol)
      };
    });
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

    const days = rangeToDays(range);
    return this.cachedJson(`lending/protocols/${protocol}/timeseries-${days}d-1d.json`, () =>
      this.materializer.protocolTimeseries(protocol, days)
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

    const days = rangeToDays(range);
    return this.cachedJson(`lending/protocols/${protocol}/pools/${marketId}/chart-${days}d.json`, () =>
      this.materializer.marketChart(marketId, days)
    );
  }

  async poolTimeseries(protocol: string, marketId: string, range: string, year?: string) {
    return this.poolChart(protocol, marketId, range, year);
  }

  async chain(chain: string) {
    return this.cachedJson(`lending/chains/${chain}.json`, async () => {
      const current = (await this.current()) as { data: Array<Record<string, unknown>> };
      return {
        generatedAt: new Date().toISOString(),
        status: "success",
        data: current.data.filter((row) => row.chain === chain)
      };
    });
  }

  async asset(asset: string) {
    const normalizedAsset = asset.toLowerCase();
    return this.cachedJson(`lending/assets/${normalizedAsset}.json`, async () => {
      const current = (await this.current()) as { data: Array<Record<string, unknown>> };
      return {
        generatedAt: new Date().toISOString(),
        status: "success",
        data: current.data.filter((row) => String(row.assetSymbol).toLowerCase() === normalizedAsset)
      };
    });
  }

  async history(marketId: string, range: string) {
    const days = rangeToDays(range);
    return this.materializer.marketHistory(marketId, days);
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
    const current = (await this.current()) as { data: Array<Record<string, unknown>> };
    const normalizedAsset = asset?.toLowerCase();
    const sortKey = sort ?? "supplyApy";
    const data = current.data
      .filter((row) => !normalizedAsset || String(row.assetSymbol).toLowerCase() === normalizedAsset)
      .sort((a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0));
    return { generatedAt: new Date().toISOString(), status: "success", data };
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
}

function rangeToDays(range: string): number {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  if (range === "1y" || range === "365d" || range === "year") return 365;
  return 30;
}
