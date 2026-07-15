import { Inject, Injectable } from "@nestjs/common";
import {
  type CanonicalMarketSnapshot,
  type MarketDefinition,
  type RawMarketSnapshot
} from "@lendingscope/core";
import { runQualityChecks, scoreQuality } from "@lendingscope/quality";
import { type Prisma } from "@lendingscope/db";
import { PrismaService } from "../db/prisma.service";
import { QualityPersistenceService } from "../quality/quality-persistence.service";
import { DailySnapshotProjectionService } from "./daily-snapshot-projection.service";

@Injectable()
export class SnapshotPersistenceService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(QualityPersistenceService)
    private readonly qualityPersistence: QualityPersistenceService,
    @Inject(DailySnapshotProjectionService)
    private readonly dailyProjection: DailySnapshotProjectionService
  ) {}

  async persistMarket(market: MarketDefinition) {
    return this.prisma.market.upsert({
      where: { id: market.id },
      update: {
        protocol: market.protocol,
        chain: market.chain,
        adapterId: market.adapterId,
        marketType: market.marketType,
        assetSymbol: market.assetSymbol,
        assetAddress: market.assetAddress,
        sourceMethod: market.sourceMethod,
        contracts: market.contracts
      },
      create: {
        id: market.id,
        protocol: market.protocol,
        chain: market.chain,
        adapterId: market.adapterId,
        marketType: market.marketType,
        assetSymbol: market.assetSymbol,
        assetAddress: market.assetAddress,
        sourceMethod: market.sourceMethod,
        contracts: market.contracts
      }
    });
  }

  async persistSnapshot(
    runId: string,
    raw: RawMarketSnapshot,
    canonical: CanonicalMarketSnapshot
  ): Promise<{ snapshotId: string; checks: number; created: boolean }> {
    const rawRecord = await this.prisma.rawMarketSnapshot.create({
      data: {
        runId,
        adapterId: raw.adapterId,
        protocol: raw.protocol,
        chain: raw.chain,
        marketId: raw.marketId,
        blockNumber: raw.blockNumber,
        sourceMethod: raw.sourceMethod,
        payloadHash: raw.payloadHash,
        payloadJson: raw.payload as Prisma.InputJsonValue
      }
    });

    const timestamp = new Date(canonical.timestamp);
    const previous = await this.previousSnapshot(canonical.marketId, timestamp);
    const qualityResults = runQualityChecks(canonical, previous ?? undefined);
    const dataQualityScore = scoreQuality(qualityResults);
    const snapshot = { ...canonical, dataQualityScore };

    const existing = await this.prisma.marketSnapshot.findFirst({
      where: { marketId: snapshot.marketId, timestamp }
    });

    const data = this.snapshotData(runId, rawRecord.id, snapshot);
    const snapshotRecord = existing
      ? await this.prisma.marketSnapshot.update({
          where: { id: existing.id },
          data
        })
      : await this.prisma.marketSnapshot.create({
          data
        });

    if (existing) {
      await this.prisma.qualityCheck.deleteMany({ where: { snapshotId: snapshotRecord.id } });
    }
    await this.qualityPersistence.persist(snapshotRecord.id, qualityResults);
    await this.dailyProjection.projectSnapshot(snapshotRecord.id);

    return { snapshotId: snapshotRecord.id, checks: qualityResults.length, created: !existing };
  }

  private async previousSnapshot(
    marketId: string,
    before: Date
  ): Promise<CanonicalMarketSnapshot | null> {
    const previous = await this.prisma.marketSnapshot.findFirst({
      where: { marketId, timestamp: { lt: before } },
      orderBy: { timestamp: "desc" }
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
        contracts: previous.sourceContracts as string[]
      }
    };
  }

  private snapshotData(
    runId: string,
    rawSnapshotId: string,
    snapshot: CanonicalMarketSnapshot
  ): Prisma.MarketSnapshotUncheckedCreateInput {
    return {
      runId,
      marketId: snapshot.marketId,
      timestamp: new Date(snapshot.timestamp),
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
      sourcePayloadHash: snapshot.source.payloadHash,
      sourceMethod: snapshot.source.method,
      sourceContracts: snapshot.source.contracts,
      rawSnapshotId
    };
  }
}
