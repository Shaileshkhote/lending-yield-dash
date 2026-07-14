import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@stablewatch-lending/db";
import { PrismaService } from "../db/prisma.service";

type RebuildOptions = {
  from?: Date;
  to?: Date;
  marketId?: string;
};

type ProjectableSnapshot = Prisma.MarketSnapshotGetPayload<Record<string, never>>;

type DailySnapshotFields = {
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
  ltv: number | null;
  liquidationThreshold: number | null;
  reserveFactor: number | null;
  supplyCapUsd: number | null;
  borrowCapUsd: number | null;
  isActive: boolean;
  isPaused: boolean;
  dataQualityScore: number;
  sourcePayloadHash: string;
  sourceMethod: string;
  sourceContracts: Prisma.InputJsonValue;
  rawSnapshotId: string;
  snapshotId: string;
};

@Injectable()
export class DailySnapshotProjectionService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService
  ) {}

  async projectSnapshot(snapshotId: string): Promise<{ dailySnapshotId: string } | null> {
    const snapshot = await this.prisma.marketSnapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot) return null;
    return this.projectMarketDate(snapshot.marketId, snapshot.timestamp);
  }

  async projectMarketDate(marketId: string, timestamp: Date): Promise<{ dailySnapshotId: string } | null> {
    const date = startOfUtcDay(timestamp);
    const nextDate = addUtcDays(date, 1);
    const latest = await this.prisma.marketSnapshot.findFirst({
      where: {
        marketId,
        timestamp: {
          gte: date,
          lt: nextDate
        }
      },
      orderBy: { timestamp: "desc" }
    });

    if (!latest) return null;

    const record = await this.prisma.dailyMarketSnapshot.upsert({
      where: {
        marketId_date: {
          marketId,
          date
        }
      },
      update: this.dailySnapshotData(latest),
      create: {
        marketId,
        date,
        ...this.dailySnapshotData(latest)
      }
    });

    return { dailySnapshotId: record.id };
  }

  async rebuild(options: RebuildOptions = {}): Promise<{ projected: number }> {
    const filters: Prisma.Sql[] = [];
    if (options.marketId) filters.push(Prisma.sql`s."marketId" = ${options.marketId}`);
    if (options.from) filters.push(Prisma.sql`s."timestamp" >= ${options.from}`);
    if (options.to) filters.push(Prisma.sql`s."timestamp" < ${options.to}`);
    const where = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}` : Prisma.empty;

    const projected = await this.prisma.$executeRaw`
      INSERT INTO "DailyMarketSnapshot" (
        "id",
        "marketId",
        "date",
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
        "sourceContracts",
        "rawSnapshotId",
        "snapshotId",
        "createdAt",
        "updatedAt"
      )
      SELECT
        concat('daily_', md5(concat(latest."marketId", ':', latest."date"::text))),
        latest."marketId",
        latest."date",
        latest."timestamp",
        latest."blockNumber",
        latest."protocol",
        latest."adapterId",
        latest."chain",
        latest."marketType",
        latest."assetSymbol",
        latest."assetAddress",
        latest."supplyApy",
        latest."borrowApy",
        latest."rewardSupplyApy",
        latest."rewardBorrowApy",
        latest."netSupplyApy",
        latest."totalSuppliedUsd",
        latest."totalBorrowedUsd",
        latest."availableLiquidityUsd",
        latest."utilization",
        latest."ltv",
        latest."liquidationThreshold",
        latest."reserveFactor",
        latest."supplyCapUsd",
        latest."borrowCapUsd",
        latest."isActive",
        latest."isPaused",
        latest."dataQualityScore",
        latest."sourcePayloadHash",
        latest."sourceMethod",
        latest."sourceContracts",
        latest."rawSnapshotId",
        latest."id",
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM (
        SELECT DISTINCT ON (s."marketId", date_trunc('day', s."timestamp"))
          s.*,
          date_trunc('day', s."timestamp") AS "date"
        FROM "MarketSnapshot" s
        ${where}
        ORDER BY s."marketId", date_trunc('day', s."timestamp"), s."timestamp" DESC
      ) latest
      ON CONFLICT ("marketId", "date") DO UPDATE SET
        "timestamp" = EXCLUDED."timestamp",
        "blockNumber" = EXCLUDED."blockNumber",
        "protocol" = EXCLUDED."protocol",
        "adapterId" = EXCLUDED."adapterId",
        "chain" = EXCLUDED."chain",
        "marketType" = EXCLUDED."marketType",
        "assetSymbol" = EXCLUDED."assetSymbol",
        "assetAddress" = EXCLUDED."assetAddress",
        "supplyApy" = EXCLUDED."supplyApy",
        "borrowApy" = EXCLUDED."borrowApy",
        "rewardSupplyApy" = EXCLUDED."rewardSupplyApy",
        "rewardBorrowApy" = EXCLUDED."rewardBorrowApy",
        "netSupplyApy" = EXCLUDED."netSupplyApy",
        "totalSuppliedUsd" = EXCLUDED."totalSuppliedUsd",
        "totalBorrowedUsd" = EXCLUDED."totalBorrowedUsd",
        "availableLiquidityUsd" = EXCLUDED."availableLiquidityUsd",
        "utilization" = EXCLUDED."utilization",
        "ltv" = EXCLUDED."ltv",
        "liquidationThreshold" = EXCLUDED."liquidationThreshold",
        "reserveFactor" = EXCLUDED."reserveFactor",
        "supplyCapUsd" = EXCLUDED."supplyCapUsd",
        "borrowCapUsd" = EXCLUDED."borrowCapUsd",
        "isActive" = EXCLUDED."isActive",
        "isPaused" = EXCLUDED."isPaused",
        "dataQualityScore" = EXCLUDED."dataQualityScore",
        "sourcePayloadHash" = EXCLUDED."sourcePayloadHash",
        "sourceMethod" = EXCLUDED."sourceMethod",
        "sourceContracts" = EXCLUDED."sourceContracts",
        "rawSnapshotId" = EXCLUDED."rawSnapshotId",
        "snapshotId" = EXCLUDED."snapshotId",
        "updatedAt" = CURRENT_TIMESTAMP
    `;

    return { projected };
  }

  private dailySnapshotData(snapshot: ProjectableSnapshot): DailySnapshotFields {
    return {
      timestamp: snapshot.timestamp,
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
      dataQualityScore: snapshot.dataQualityScore,
      sourcePayloadHash: snapshot.sourcePayloadHash,
      sourceMethod: snapshot.sourceMethod,
      sourceContracts: snapshot.sourceContracts as Prisma.InputJsonValue,
      rawSnapshotId: snapshot.rawSnapshotId,
      snapshotId: snapshot.id
    };
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
