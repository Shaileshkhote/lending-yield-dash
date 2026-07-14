export const CHAIN = {
  ETHEREUM: "ethereum",
  BASE: "base"
} as const;

export type Chain = (typeof CHAIN)[keyof typeof CHAIN];

export const SUPPORTED_CHAINS: readonly Chain[] = [CHAIN.ETHEREUM, CHAIN.BASE];

export const PUBLIC_RPC_URLS: Record<Chain, readonly string[]> = {
  [CHAIN.ETHEREUM]: [
    "https://mainnet.gateway.tenderly.co",
    "https://eth.llamarpc.com",
    "https://eth.drpc.org",
    "https://ethereum-rpc.publicnode.com",
    "https://cloudflare-eth.com",
    "https://rpc.flashbots.net"
  ],
  [CHAIN.BASE]: [
    "https://base.gateway.tenderly.co",
    "https://base.llamarpc.com",
    "https://1rpc.io/base",
    "https://base.meowrpc.com",
    "https://base.drpc.org",
    "https://mainnet.base.org/",
    "https://developer-access-mainnet.base.org/",
    "https://base-rpc.publicnode.com"
  ]
};

export function isSupportedChain(chain: string): chain is Chain {
  return (SUPPORTED_CHAINS as readonly string[]).includes(chain);
}

export function normalizeChain(chain: string): string {
  return chain.trim().toLowerCase();
}

export function rpcEnvKey(chain: string): string {
  return `${chain.toUpperCase()}_RPC_URL`;
}
