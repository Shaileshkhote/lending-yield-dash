import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  lendingAdapters,
  rpcUrlsForChains,
  type LendingAdapter,
} from "@lendingscope/adapters";
import { PrismaService } from "../db/prisma.service";
import { SnapshotPersistenceService } from "./snapshot-persistence.service";
import { envInt, mapWithConcurrency, shuffle } from "../utils/concurrency";

type IngestionWorkItem = {
  adapter: LendingAdapter;
  chain: string;
};

@Injectable()
export class AdapterRunnerService {
  private readonly logger = new Logger(AdapterRunnerService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(SnapshotPersistenceService)
    private readonly snapshotPersistence: SnapshotPersistenceService,
  ) {}

  async runOnce(): Promise<{
    runId: string;
    snapshots: number;
    checks: number;
    errors: number;
  }> {
    const runId = `run_${new Date().toISOString()}_${randomUUID().slice(0, 8)}`;
    const now = new Date();
    let snapshots = 0;
    let checks = 0;
    const errors: Array<{ adapter: string; chain: string; message: string }> = [];
    const workItems = shuffle(
      lendingAdapters.flatMap((adapter) =>
        adapter.supportedChains.map((chain) => ({ adapter, chain }))
      )
    );
    const workConcurrency = envInt("INGEST_WORK_CONCURRENCY", envInt("INGEST_ADAPTER_CONCURRENCY", 3));
    const writeConcurrency = envInt("INGEST_WRITE_CONCURRENCY", 8);

    await this.prisma.ingestionRun.create({
      data: { id: runId, status: "running", startedAt: now },
    });

    try {
      await mapWithConcurrency(workItems, workConcurrency, async ({ adapter, chain }: IngestionWorkItem) => {
        try {
          const result = await adapter.fetch({
            runId,
            now,
            rpcUrls: rpcUrlsForChains(adapter.supportedChains),
            chain,
            chains: [chain],
          });

          await mapWithConcurrency(result.markets, writeConcurrency, async (market) => {
            await this.snapshotPersistence.persistMarket(market);
          });

          await mapWithConcurrency(result.rawPayloads, writeConcurrency, async (rawPayload, index) => {
            const canonical = result.snapshots[index];
            if (!rawPayload || !canonical) return;
            const persisted = await this.snapshotPersistence.persistSnapshot(
              runId,
              rawPayload,
              canonical,
            );
            snapshots += 1;
            checks += persisted.checks;
          });

          for (const error of result.errors ?? []) {
            errors.push({
              adapter: adapter.id,
              chain,
              message: error.marketId ? `${error.marketId}: ${error.message}` : error.message,
            });
          }
        } catch (error) {
          errors.push({
            adapter: adapter.id,
            chain,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

      await this.prisma.ingestionRun.update({
        where: { id: runId },
        data: {
          status: errors.length ? "partial_success" : "success",
          finishedAt: new Date(),
          error: errors.length ? JSON.stringify(errors.slice(0, 20)) : null,
        },
      });

      this.logger.log(
        `Ingestion ${runId} complete: ${snapshots} snapshots, ${checks} checks, ${errors.length} errors`,
      );
      return { runId, snapshots, checks, errors: errors.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.ingestionRun.update({
        where: { id: runId },
        data: { status: "failed", finishedAt: new Date(), error: message },
      });
      this.logger.error(`Ingestion ${runId} failed: ${message}`);
      throw error;
    }
  }
}
