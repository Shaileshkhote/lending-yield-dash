import { useEffect, useMemo, useState } from "react";
import { chainLogoUrls, chainMeta } from "../lib/chains";

type ChainBadgeProps = {
  chain: string;
  compact?: boolean;
};

export function ChainBadge({ chain, compact = false }: ChainBadgeProps) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const normalized = chain.toLowerCase();
  const meta = chainMeta(chain);
  const sources = useMemo(() => chainLogoUrls(chain), [chain]);
  const src = sources[sourceIndex];

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  return (
    <span className={`chain-badge chain-${normalized}`} title={meta.label}>
      <span className={`chain-mark ${src ? "has-image" : ""}`}>
        {src ? (
          <img alt="" decoding="async" loading="lazy" src={src} onError={() => setSourceIndex((index) => index + 1)} />
        ) : (
          <span>{meta.short.slice(0, 3)}</span>
        )}
      </span>
      {compact ? null : <span>{meta.label}</span>}
    </span>
  );
}
