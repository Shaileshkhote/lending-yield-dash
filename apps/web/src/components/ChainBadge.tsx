const CHAIN_META: Record<string, { label: string; short: string }> = {
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

type ChainBadgeProps = {
  chain: string;
  compact?: boolean;
};

export function ChainBadge({ chain, compact = false }: ChainBadgeProps) {
  const normalized = chain.toLowerCase();
  const meta = CHAIN_META[normalized] ?? { label: titleCase(chain), short: chain.slice(0, 5).toUpperCase() };

  return (
    <span className={`chain-badge chain-${normalized}`} title={meta.label}>
      <span className="chain-mark">{meta.short}</span>
      {compact ? null : <span>{meta.label}</span>}
    </span>
  );
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
