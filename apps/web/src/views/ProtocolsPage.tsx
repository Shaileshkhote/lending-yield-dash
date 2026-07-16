"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProtocolsPageSkeleton } from "../components/Skeletons";
import { fetchJson, formatUsd, type CurrentMarketsResponse, type LendingMarket } from "../lib/api";
import { chainLogoUrls, chainMeta } from "../lib/chains";
import { buildProtocolGroups, protocolPath } from "../lib/protocols";

export function ProtocolsPage() {
  const [data, setData] = useState<CurrentMarketsResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then(setData);
  }, []);

  const groups = useMemo(() => buildProtocolGroups(data?.data ?? []), [data]);

  if (!data) return <ProtocolsPageSkeleton />;

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Protocols</p>
          <h1>Protocols</h1>
        </div>
      </header>

      <section className="market-panel protocol-directory-panel">
        <div className="protocol-directory-head">
          <span>Protocols</span>
          <span>Chains</span>
          <span>TVL</span>
          <span>Markets</span>
          <span aria-hidden="true" />
        </div>
        <div className="protocol-list">
          {groups.map((group) => {
            const isExpanded = expanded.has(group.id);
            const hasVariants = group.variants.length > 1;
            const rowContent = (
              <>
                <span className="protocol-left">
                  <span className={group.metadata?.logo ? "protocol-symbol has-image" : "protocol-symbol"}>
                    {group.metadata?.logo ? <img src={group.metadata.logo} alt={`${group.label} logo`} /> : group.symbol}
                  </span>
                  <span>
                    <strong>{group.label}</strong>
                    <em>{hasVariants ? `${group.variants.length} versions` : "Protocol"}</em>
                  </span>
                </span>
                <ChainIconStack chains={[...new Set(group.markets.map((market) => market.chain))].sort()} />
                <span className="protocol-tvl">{formatUsd(totalProtocolTvl(group.markets))}</span>
                <span className="protocol-right">
                  <b>{group.markets.length}</b>
                </span>
                <span className={hasVariants ? "protocol-row-arrow" : "protocol-row-arrow open-link"} aria-hidden="true">
                  {hasVariants ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              </>
            );
            return (
              <div key={group.id} className="protocol-list-item">
                {hasVariants ? (
                  <button
                    className="protocol-row"
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpanded(group.id)}
                  >
                    {rowContent}
                  </button>
                ) : (
                  <Link className="protocol-row" href={protocolPath(group.id)}>
                    {rowContent}
                  </Link>
                )}
                {isExpanded && hasVariants ? (
                  <div className="protocol-variants">
                    {group.variants.map((variant) => (
                      <Link key={variant.id} className="protocol-variant" href={protocolPath(variant.id)}>
                        <span className="protocol-left protocol-variant-left">
                          <span className="protocol-variant-name">
                            <strong>{variant.label}</strong>
                          </span>
                        </span>
                        <ChainIconStack chains={[...new Set(variant.markets.map((market) => market.chain))].sort()} />
                        <span className="protocol-tvl">{formatUsd(totalProtocolTvl(variant.markets))}</span>
                        <span className="protocol-right">
                          <b>{variant.markets.length}</b>
                        </span>
                        <span className="protocol-row-arrow open-link" aria-hidden="true">
                          <ChevronRight size={16} />
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function totalProtocolTvl(markets: LendingMarket[]): number {
  return markets.reduce((sum, market) => sum + (market.totalSuppliedUsd ?? 0), 0);
}

function ChainIconStack({ chains }: { chains: string[] }) {
  const visibleChains = chains.slice(0, 5);
  const hiddenCount = Math.max(0, chains.length - visibleChains.length);
  return (
    <span className="protocol-chain-stack" aria-label={`${chains.length} chains`}>
      {visibleChains.map((chain) => (
        <ChainStackIcon key={chain} chain={chain} />
      ))}
      {hiddenCount ? <span className="protocol-chain-more">+{hiddenCount}</span> : null}
    </span>
  );
}

function ChainStackIcon({ chain }: { chain: string }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = useMemo(() => chainLogoUrls(chain), [chain]);
  const sourceKey = sources.join("|");
  const source = sources[sourceIndex];
  const meta = chainMeta(chain);

  useEffect(() => {
    setSourceIndex(0);
  }, [sourceKey]);

  return (
    <span className={`protocol-chain-icon${source ? " has-image" : ""}`} title={meta.label}>
      {source ? <img alt="" decoding="async" loading="lazy" src={source} onError={() => setSourceIndex((index) => index + 1)} /> : meta.short.slice(0, 2)}
    </span>
  );
}
