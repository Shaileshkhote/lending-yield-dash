export const CHAIN = {
  ETHEREUM: "ethereum",
  ARBITRUM: "arbitrum",
  BASE: "base",
  BSC: "bsc",
  POLYGON: "polygon",
  SOLANA: "solana"
} as const;

export type Chain = (typeof CHAIN)[keyof typeof CHAIN];

export const SUPPORTED_CHAINS: readonly Chain[] = [
  CHAIN.ETHEREUM,
  CHAIN.ARBITRUM,
  CHAIN.BASE,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.SOLANA
];

export const PUBLIC_RPC_URLS: Record<Chain, readonly string[]> = {
  [CHAIN.ETHEREUM]: [
    "https://mainnet.gateway.tenderly.co",
    "https://eth.llamarpc.com",
    "https://eth.drpc.org",
    "https://ethereum-rpc.publicnode.com",
    "https://cloudflare-eth.com",
    "https://rpc.flashbots.net"
  ],
  [CHAIN.ARBITRUM]: [
    "https://arbitrum.gateway.tenderly.co",
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.llamarpc.com",
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arbitrum.drpc.org"
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
  ],
  [CHAIN.BSC]: [
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc-dataseed1.ninicoin.io",
    "https://bsc-rpc.publicnode.com",
    "https://bsc.drpc.org"
  ],
  [CHAIN.POLYGON]: [
    "https://polygon.gateway.tenderly.co",
    "https://polygon.llamarpc.com",
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon-rpc.com",
    "https://polygon.drpc.org"
  ],
  [CHAIN.SOLANA]: []
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
