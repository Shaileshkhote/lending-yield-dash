import { Inject, Injectable } from "@nestjs/common";
import type { QualityCheckResult } from "@lendingscope/core";
import { PrismaService } from "../db/prisma.service";

@Injectable()
export class QualityPersistenceService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService
  ) {}

  async persist(snapshotId: string, checks: QualityCheckResult[]) {
    await this.prisma.qualityCheck.createMany({
      data: checks.map((check) => ({
        snapshotId,
        marketId: check.marketId,
        checkName: check.checkName,
        status: check.status,
        severity: check.severity,
        message: check.message,
        observedValue: check.observedValue,
        expectedValue: check.expectedValue
      }))
    });
  }
}
