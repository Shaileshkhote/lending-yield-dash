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

export function rpcUrlsForChains(chains: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(chains.map((chain) => [chain, rpcCandidatesForChain(chain)[0]]));
}

function rpcCandidatesForContext(ctx: { rpcUrls?: Record<string, string | undefined> }, chain: string): string[] {
  const explicitUrls = ctx.rpcUrls?.[chain]?.split(",").map((url) => url.trim()).filter(Boolean) ?? [];
  const urls = explicitUrls.length ? explicitUrls : rpcCandidatesForChain(chain);
  return [...new Set(urls)];
}
