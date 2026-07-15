import "reflect-metadata";
import { loadEnv } from "../config/env";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { MaterializerService } from "../materializer/materializer.service";

loadEnv();

process.env.DISABLE_SCHEDULER ??= "1";

const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
try {
  const materializer = app.get(MaterializerService);
  const result = await materializer.materializeCurrentLite();
  console.log(JSON.stringify(result, null, 2));
} finally {
  await app.close();
}
