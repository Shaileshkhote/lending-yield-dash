"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { chainLogoUrls, chainMeta } from "../lib/chains";
import { normalizeTokenSymbol, tokenLogoUrls } from "../lib/token-icons";

type TokenLogoProps = {
  symbol: string;
  chain?: string;
  address?: string;
  size?: "ticker" | "market" | "hero";
  showNetwork?: boolean;
};

function TokenLogoComponent({ symbol, chain, address, size = "market", showNetwork = true }: TokenLogoProps) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [networkSourceIndex, setNetworkSourceIndex] = useState(0);
  const slug = normalizeTokenSymbol(symbol);
  const sources = useMemo(
    () => tokenLogoUrls({ symbol, chain, address }),
    [address, chain, symbol],
  );
  const networkSources = useMemo(() => chainLogoUrls(chain), [chain]);
  const src = sources[sourceIndex];
  const networkSrc = networkSources[networkSourceIndex];
  const network = chain ? chainMeta(chain) : null;

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  useEffect(() => {
    setNetworkSourceIndex(0);
  }, [networkSources]);

  return (
    <span
      aria-label={`${symbol} logo`}
      className={`token-logo token-${slug} token-${size}${src ? " has-image" : ""}`}
      role="img"
    >
      {src ? (
        <img
          alt=""
          className="token-logo-image"
          decoding="async"
          loading="lazy"
          src={src}
          onError={() => setSourceIndex((index) => index + 1)}
        />
      ) : null}
      {showNetwork && chain ? (
        <span className={`token-network token-network-${size}`} aria-label={network?.label ?? chain} title={network?.label ?? chain}>
          {networkSrc ? (
            <img
              alt=""
              className="token-network-image"
              decoding="async"
              loading="lazy"
              src={networkSrc}
              onError={() => setNetworkSourceIndex((index) => index + 1)}
            />
          ) : (
            <span>{network?.short.slice(0, 3) ?? chain.slice(0, 3).toUpperCase()}</span>
          )}
        </span>
      ) : null}
    </span>
  );
}

export const TokenLogo = memo(TokenLogoComponent);
