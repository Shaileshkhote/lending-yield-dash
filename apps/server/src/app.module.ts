import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "node:path";
import { PrismaService } from "./db/prisma.service";
import { IngestionScheduler } from "./ingestion/ingestion.scheduler";
import { AdapterRunnerService } from "./ingestion/adapter-runner.service";
import { SnapshotPersistenceService } from "./ingestion/snapshot-persistence.service";
import { DailySnapshotProjectionService } from "./ingestion/daily-snapshot-projection.service";
import { QualityPersistenceService } from "./quality/quality-persistence.service";
import { MaterializerService } from "./materializer/materializer.service";
import { MaterializationScheduler } from "./materializer/materialization.scheduler";
import { R2StorageService } from "./materializer/r2-storage.service";
import { LendingController } from "./lending/lending.controller";
import { LendingService } from "./lending/lending.service";
import { InternalController } from "./internal/internal.controller";

const staticImports = [
  ServeStaticModule.forRoot({
    rootPath: join(process.cwd(), "public", "data"),
    serveRoot: "/data"
  }),
  ...(process.env.SERVE_WEB === "1"
    ? [
        ServeStaticModule.forRoot({
          rootPath: join(process.cwd(), "..", "web", "dist"),
          exclude: ["/api/*"]
        })
      ]
    : [])
];

@Module({
  imports: [ScheduleModule.forRoot(), ...staticImports],
  controllers: [LendingController, InternalController],
  providers: [
    PrismaService,
    AdapterRunnerService,
    SnapshotPersistenceService,
    DailySnapshotProjectionService,
    IngestionScheduler,
    QualityPersistenceService,
    MaterializerService,
    MaterializationScheduler,
    R2StorageService,
    LendingService
  ]
})
export class AppModule {}
