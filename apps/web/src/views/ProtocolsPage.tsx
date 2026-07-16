"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MarketTableSkeleton } from "../components/Skeletons";
import { fetchJson, type CurrentMarketsResponse } from "../lib/api";
import { buildProtocolGroups, protocolPath } from "../lib/protocols";

export function ProtocolsPage() {
  const [data, setData] = useState<CurrentMarketsResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["aave"]));

  useEffect(() => {
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then(setData);
  }, []);

  const groups = useMemo(() => buildProtocolGroups(data?.data ?? []), [data]);

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
        {data ? (
          <>
            <div className="protocol-directory-head">
              <span>Protocol</span>
              <span>Markets</span>
            </div>
            <div className="protocol-list">
              {groups.map((group) => {
                const isExpanded = expanded.has(group.id);
                const hasVariants = group.variants.length > 1;
                return (
                  <div key={group.id} className="protocol-list-item">
                    <Link className="protocol-row" href={protocolPath(group.id)}>
                      <span className="protocol-left">
                        <span className="protocol-symbol">{group.symbol}</span>
                        <span>
                          <strong>{group.label}</strong>
                          <em>{hasVariants ? `${group.variants.length} versions` : "Protocol"}</em>
                        </span>
                      </span>
                      <span className="protocol-right">
                        <b>{group.markets.length}</b>
                        <span>markets</span>
                      </span>
                    </Link>
                    {hasVariants ? (
                      <button
                        className={isExpanded ? "protocol-expand open" : "protocol-expand"}
                        type="button"
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${group.label}`}
                        onClick={() => toggleExpanded(group.id)}
                      >
                        <ChevronDown size={17} />
                      </button>
                    ) : (
                      <Link className="protocol-expand" href={protocolPath(group.id)} aria-label={`Open ${group.label}`}>
                        <ChevronRight size={17} />
                      </Link>
                    )}
                    {isExpanded && hasVariants ? (
                      <div className="protocol-variants">
                        {group.variants.map((variant) => (
                          <Link key={variant.id} className="protocol-variant" href={protocolPath(variant.id)}>
                            <span>{variant.label}</span>
                            <b>{variant.markets.length}</b>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <MarketTableSkeleton rows={8} />
        )}
      </section>
    </div>
  );
}
