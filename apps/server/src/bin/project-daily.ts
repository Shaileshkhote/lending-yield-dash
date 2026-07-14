import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { loadEnv } from "../config/env";
import { DailySnapshotProjectionService } from "../ingestion/daily-snapshot-projection.service";

loadEnv();

process.env.DISABLE_SCHEDULER ??= "1";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  const projection = app.get(DailySnapshotProjectionService);

  try {
    const result = await projection.rebuild(options);
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2));
  } finally {
    await app.close();
  }
}

function parseArgs(args: string[]) {
  const normalized = args.filter((arg) => arg !== "--");
  const from = valueFor(normalized, "--from=");
  const to = valueFor(normalized, "--to=");
  const marketId = valueFor(normalized, "--market=");

  return {
    ...(from ? { from: parseDate(from, "--from") } : {}),
    ...(to ? { to: addUtcDays(parseDate(to, "--to"), 1) } : {}),
    ...(marketId ? { marketId } : {})
  };
}

function valueFor(args: string[], prefix: string): string | undefined {
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseDate(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label} value ${value}. Use YYYY-MM-DD.`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
