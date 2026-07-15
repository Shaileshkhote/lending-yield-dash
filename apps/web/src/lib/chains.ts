export const TRUST_WALLET_CHAIN_SLUGS: Record<string, string> = {
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  optimism: "optimism",
  polygon: "polygon",
  avalanche: "avalanchec",
  bsc: "smartchain",
};

export const CHAIN_META: Record<string, { label: string; short: string }> = {
  ethereum: { label: "Ethereum", short: "ETH" },
  base: { label: "Base", short: "BASE" },
  arbitrum: { label: "Arbitrum", short: "ARB" },
  optimism: { label: "Optimism", short: "OP" },
  polygon: { label: "Polygon", short: "POL" },
  avalanche: { label: "Avalanche", short: "AVAX" },
  bsc: { label: "BNB Chain", short: "BNB" },
  unichain: { label: "Unichain", short: "UNI" },
  hyperevm: { label: "HyperEVM", short: "HYPE" },
  katana: { label: "Katana", short: "KTN" },
  worldchain: { label: "World Chain", short: "WLD" },
  stable: { label: "Stable", short: "STBL" },
};

export function chainMeta(chain: string): { label: string; short: string } {
  return CHAIN_META[chain.toLowerCase()] ?? { label: titleCase(chain), short: chain.slice(0, 5).toUpperCase() };
}

export function trustWalletChainLogoUrl(chain?: string): string | null {
  if (!chain) return null;
  const slug = TRUST_WALLET_CHAIN_SLUGS[chain.toLowerCase()];
  if (!slug) return null;
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${slug}/info/logo.png`;
}

export function chainLogoUrls(chain?: string): string[] {
  if (!chain) return [];
  return unique([
    trustWalletChainLogoUrl(chain),
    `https://icons.llamao.fi/icons/chains/rsz_${chain.toLowerCase()}?w=48&h=48`,
  ]);
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
