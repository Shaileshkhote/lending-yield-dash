import { access, readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { LendingAdapter } from "./types";

export const lendingAdapters: LendingAdapter[] = await discoverAdapters();

export function getAdapter(adapterId: string): LendingAdapter {
  const adapter = lendingAdapters.find(
    (item: LendingAdapter) => item.id === adapterId,
  );
  if (!adapter) {
    throw new Error(`No lending adapter registered for ${adapterId}`);
  }
  return adapter;
}

async function discoverAdapters(): Promise<LendingAdapter[]> {
  const adapterModules = await adapterModulePaths();
  const adapters = (
    await Promise.all(adapterModules.map((modulePath) => importAdapter(modulePath)))
  )
    .flat()
    .sort((a, b) => a.id.localeCompare(b.id));
  assertUniqueAdapters(adapters);
  return adapters;
}

async function adapterModulePaths(): Promise<string[]> {
  const adaptersDir = join(dirname(fileURLToPath(import.meta.url)), "adapters");
  const entries = await readdir(adaptersDir, { withFileTypes: true });
  const modules: string[] = [];

  for (const entry of entries) {
    const fullPath = join(adaptersDir, entry.name);
    if (entry.isDirectory()) {
      const indexPath = join(fullPath, `index${runtimeExtension()}`);
      if (await fileExists(indexPath)) {
        modules.push(indexPath);
      }
      continue;
    }
    if (isAdapterFile(entry.name)) {
      modules.push(fullPath);
    }
  }

  return modules.sort();
}

async function importAdapter(modulePath: string): Promise<LendingAdapter[]> {
  const moduleExports = await import(pathToFileURL(modulePath).href);
  return Object.values(moduleExports).filter(isLendingAdapter);
}

function isAdapterFile(name: string): boolean {
  const extension = extname(name);
  return (
    extension === runtimeExtension() &&
    !name.endsWith(".d.ts") &&
    !name.endsWith(".test.ts") &&
    !name.endsWith(".test.js") &&
    !name.startsWith("_")
  );
}

function runtimeExtension(): ".ts" | ".js" {
  return extname(fileURLToPath(import.meta.url)) === ".ts" ? ".ts" : ".js";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isLendingAdapter(value: unknown): value is LendingAdapter {
  const adapter = value as Partial<LendingAdapter>;
  return (
    Boolean(adapter) &&
    typeof adapter.id === "string" &&
    typeof adapter.protocol === "string" &&
    typeof adapter.fetch === "function" &&
    Array.isArray(adapter.supportedChains)
  );
}

function assertUniqueAdapters(adapters: LendingAdapter[]): void {
  const seen = new Set<string>();
  for (const adapter of adapters) {
    if (seen.has(adapter.id)) {
      throw new Error(`Duplicate lending adapter registered for ${adapter.id}`);
    }
    seen.add(adapter.id);
  }
}
