import "reflect-metadata";
import { loadEnv } from "./config/env";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

loadEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`LendingScope API listening on http://localhost:${port}`);
}

void bootstrap();
