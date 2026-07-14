import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { loadEnv } from "../config/env";
import { R2StorageService } from "../materializer/r2-storage.service";

loadEnv();

process.env.DISABLE_SCHEDULER ??= "1";

async function main() {
  const prefix = process.env.R2_CLEAR_PREFIX ?? "lending/";
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  const r2 = app.get(R2StorageService);

  try {
    const result = await r2.deletePrefix(prefix);
    console.log(JSON.stringify({ prefix, ...result }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
