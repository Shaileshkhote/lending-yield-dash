import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { AdapterRunnerService } from "./adapter-runner.service";

@Injectable()
export class IngestionScheduler {
  private readonly logger = new Logger(IngestionScheduler.name);
  private running = false;

  constructor(
    @Inject(AdapterRunnerService)
    private readonly adapterRunner: AdapterRunnerService
  ) {}

  @Cron("5 1 * * *", { timeZone: "UTC" })
  async dailyIngestion() {
    if (process.env.DISABLE_SCHEDULER === "1" || process.env.DISABLE_INGESTION_SCHEDULER === "1") {
      return;
    }

    if (this.running) {
      this.logger.warn("Skipping daily ingestion because a previous run is still active");
      return;
    }

    this.running = true;
    try {
      await this.adapterRunner.runOnce();
    } finally {
      this.running = false;
    }
  }
}
