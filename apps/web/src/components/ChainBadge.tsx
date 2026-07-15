import { useEffect, useMemo, useState } from "react";
import { chainMeta, trustWalletChainLogoUrl } from "../lib/chains";

type ChainBadgeProps = {
  chain: string;
  compact?: boolean;
};

export function ChainBadge({ chain, compact = false }: ChainBadgeProps) {
  const [failed, setFailed] = useState(false);
  const normalized = chain.toLowerCase();
  const meta = chainMeta(chain);
  const src = useMemo(() => trustWalletChainLogoUrl(chain), [chain]);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span className={`chain-badge chain-${normalized}`} title={meta.label}>
      <span className={`chain-mark ${src && !failed ? "has-image" : ""}`}>
        {src && !failed ? (
          <img alt="" decoding="async" loading="lazy" src={src} onError={() => setFailed(true)} />
        ) : (
          <span>{meta.short.slice(0, 3)}</span>
        )}
      </span>
      {compact ? null : <span>{meta.label}</span>}
    </span>
  );
}
