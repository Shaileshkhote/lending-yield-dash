import "reflect-metadata";
import { loadEnv } from "../config/env";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { AdapterRunnerService } from "../ingestion/adapter-runner.service";

loadEnv();

process.env.DISABLE_SCHEDULER ??= "1";

const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
try {
  const runner = app.get(AdapterRunnerService);
  const result = await runner.runOnce();
  console.log(JSON.stringify(result, null, 2));
} finally {
  await app.close();
}
