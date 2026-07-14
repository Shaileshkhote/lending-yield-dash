import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(path = resolve(process.cwd(), "..", "..", ".env")): void {
  const candidates = [path, resolve(process.cwd(), ".env")];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const content = readFileSync(candidate, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = unquote(trimmed.slice(index + 1).trim());
      process.env[key] ??= value;
    }
  }
}

function unquote(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
