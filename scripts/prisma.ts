import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

loadEnv();

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: pnpm db:push | pnpm db:migrate | pnpm db:deploy | pnpm db:generate");
  process.exitCode = 1;
} else {
  run("pnpm", ["--filter", "@lendingscope/db", "exec", "prisma", ...args]).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

function loadEnv(): void {
  const path = findEnvFile();
  if (!path) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    process.env[key] ??= unquote(trimmed.slice(index + 1).trim());
  }
}

function findEnvFile(): string | null {
  let dir = process.cwd();
  while (true) {
    const path = resolve(dir, ".env");
    if (existsSync(path)) return path;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function unquote(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? "unknown"}`));
    });
  });
}
