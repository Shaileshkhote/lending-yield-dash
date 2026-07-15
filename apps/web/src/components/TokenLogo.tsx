"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddress, isAddress } from "viem";
import { TRUST_WALLET_CHAIN_SLUGS, chainMeta, trustWalletChainLogoUrl } from "../lib/chains";

type TokenLogoProps = {
  symbol: string;
  chain?: string;
  address?: string;
  size?: "ticker" | "market" | "hero";
  showNetwork?: boolean;
};

const SYMBOL_DEFAULTS: Record<string, { chain: string; address: string }> = {
  usdc: {
    chain: "ethereum",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  usdt: {
    chain: "ethereum",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  dai: {
    chain: "ethereum",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  },
  sdai: {
    chain: "ethereum",
    address: "0x83F20F44975D03b1b09e64809B757c47f942BEeA",
  },
  weth: {
    chain: "ethereum",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
};

export function TokenLogo({ symbol, chain, address, size = "market", showNetwork = true }: TokenLogoProps) {
  const [failed, setFailed] = useState(false);
  const [networkFailed, setNetworkFailed] = useState(false);
  const slug = symbol.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const src = useMemo(
    () => trustWalletLogoUrl({ symbol, chain, address }),
    [address, chain, symbol],
  );
  const networkSrc = useMemo(() => trustWalletChainLogoUrl(chain), [chain]);
  const network = chain ? chainMeta(chain) : null;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    setNetworkFailed(false);
  }, [networkSrc]);

  return (
    <span
      aria-label={`${symbol} logo`}
      className={`token-logo token-${slug} token-${size}${src && !failed ? " has-image" : ""}`}
      role="img"
    >
      {src && !failed ? (
        <img
          alt=""
          className="token-logo-image"
          decoding="async"
          loading="lazy"
          src={src}
          onError={() => setFailed(true)}
        />
      ) : null}
      {showNetwork && chain ? (
        <span className={`token-network token-network-${size}`} aria-label={network?.label ?? chain} title={network?.label ?? chain}>
          {networkSrc && !networkFailed ? (
            <img
              alt=""
              className="token-network-image"
              decoding="async"
              loading="lazy"
              src={networkSrc}
              onError={() => setNetworkFailed(true)}
            />
          ) : (
            <span>{network?.short.slice(0, 3) ?? chain.slice(0, 3).toUpperCase()}</span>
          )}
        </span>
      ) : null}
    </span>
  );
}

function trustWalletLogoUrl(args: { symbol: string; chain?: string; address?: string }): string | null {
  const fallback = SYMBOL_DEFAULTS[args.symbol.toLowerCase()];
  const chain = args.chain ?? fallback?.chain;
  const address = args.address ?? fallback?.address;
  if (!chain || !address || !isAddress(address)) return null;

  const trustWalletChain = TRUST_WALLET_CHAIN_SLUGS[chain.toLowerCase()];
  if (!trustWalletChain) return null;

  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${trustWalletChain}/assets/${getAddress(address)}/logo.png`;
}
