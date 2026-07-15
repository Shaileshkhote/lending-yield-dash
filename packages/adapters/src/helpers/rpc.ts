import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { isSupportedChain, PUBLIC_RPC_URLS, rpcEnvKey } from "./chains";

export function rpcCandidatesForChain(chain: string): string[] {
  const fromEnv = process.env[rpcEnvKey(chain)]?.split(",").map((url) => url.trim()).filter(Boolean) ?? [];
  const publicFallbacks = isSupportedChain(chain) ? PUBLIC_RPC_URLS[chain] : [];
  return [...fromEnv, ...publicFallbacks];
}

export function rpcUrlFor(ctx: { rpcUrls?: Record<string, string | undefined> }, chain: string): string {
  const url = ctx.rpcUrls?.[chain] ?? rpcCandidatesForChain(chain)[0];
  if (!url) {
    throw new Error(`Missing RPC URL for ${chain}. Set ${rpcEnvKey(chain)} before running ingestion.`);
  }
  return url;
}

export function publicClientFor(ctx: { rpcUrls?: Record<string, string | undefined> }, chain: string): PublicClient {
  const urls = rpcCandidatesForContext(ctx, chain);
  if (!urls.length) {
    throw new Error(`Missing RPC URL for ${chain}. Set ${rpcEnvKey(chain)} before running ingestion.`);
  }
  return createPublicClient({
    transport: fallback(urls.map((url) => http(url, { timeout: 15_000 })), { rank: false })
  });
}

export async function blockAtOrBeforeAny(
  urls: string[],
  timestamp: bigint,
): Promise<bigint> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      return await blockAtOrBefore(
        createPublicClient({ transport: http(url, { timeout: 20_000 }) }),
        timestamp,
      );
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    `No RPC could resolve block for ${timestamp.toString()}: ${errors.join(" | ")}`,
  );
}

export async function blockAtOrBefore(
  client: PublicClient,
  timestamp: bigint,
): Promise<bigint> {
  const latest = await client.getBlock();
  if (latest.timestamp <= timestamp) {
    return latest.number ?? 0n;
  }

  let low = 0n;
  let high = latest.number ?? 0n;
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    const block = await client.getBlock({ blockNumber: mid });
    if (block.timestamp <= timestamp) {
      low = mid;
    } else {
      high = mid - 1n;
    }
  }
  return low;
}

export function rpcUrlsForChains(chains: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(chains.map((chain) => [chain, rpcCandidatesForChain(chain)[0]]));
}

export function rpcCandidatesForContext(ctx: { rpcUrls?: Record<string, string | undefined> }, chain: string): string[] {
  const explicitUrls = ctx.rpcUrls?.[chain]?.split(",").map((url) => url.trim()).filter(Boolean) ?? [];
  const urls = explicitUrls.length ? explicitUrls : rpcCandidatesForChain(chain);
  return [...new Set(urls)];
}
