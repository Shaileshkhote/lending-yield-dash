import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { MaterializerService } from "./materializer.service";

@Injectable()
export class MaterializationScheduler {
  private readonly logger = new Logger(MaterializationScheduler.name);
  private running = false;

  constructor(
    @Inject(MaterializerService)
    private readonly materializer: MaterializerService
  ) {}

  @Cron("35 1 * * *", { timeZone: "UTC" })
  async dailyMaterialization() {
    if (process.env.DISABLE_SCHEDULER === "1" || process.env.DISABLE_MATERIALIZER_SCHEDULER === "1") {
      return;
    }

    if (this.running) {
      this.logger.warn("Skipping daily materialization because a previous run is still active");
      return;
    }

    this.running = true;
    try {
      await this.materializer.materialize();
    } finally {
      this.running = false;
    }
  }
}
