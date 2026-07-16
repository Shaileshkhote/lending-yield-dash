"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MarketTable } from "../components/MarketTable";
import { MarketTableSkeleton } from "../components/Skeletons";
import { fetchJson, formatPct, formatUsd, type CurrentMarketsResponse } from "../lib/api";
import { buildProtocolGroups, protocolPath, protocolStats, resolveProtocolSelection } from "../lib/protocols";

export function ProtocolDetailPage() {
  const params = useParams<{ protocolId?: string | string[] }>();
  const protocolId = params?.protocolId;
  const resolvedProtocolId = Array.isArray(protocolId) ? protocolId[0] : protocolId;
  const [data, setData] = useState<CurrentMarketsResponse | null>(null);

  useEffect(() => {
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then(setData);
  }, []);

  const groups = useMemo(() => buildProtocolGroups(data?.data ?? []), [data]);
  const selection = useMemo(
    () => (resolvedProtocolId ? resolveProtocolSelection(groups, decodeURIComponent(resolvedProtocolId)) : null),
    [groups, resolvedProtocolId],
  );
  const stats = selection ? protocolStats(selection.markets) : null;

  if (!data) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Protocols</p>
            <h1>Loading protocol</h1>
          </div>
        </header>
        <section className="protocol-detail">
          <MarketTableSkeleton rows={8} />
        </section>
      </div>
    );
  }

  if (!selection || !stats) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Protocols</p>
            <h1>Protocol not found</h1>
          </div>
          <Link className="protocol-back-link" href="/lending/protocols">
            Protocols
            <ChevronRight size={15} />
          </Link>
        </header>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{selection.group.label}</p>
          <h1>{selection.label}</h1>
        </div>
        <Link className="protocol-back-link" href="/lending/protocols">
          Protocols
          <ChevronRight size={15} />
        </Link>
      </header>

      <section className="protocol-detail">
        {selection.group.variants.length > 1 ? (
          <div className="protocol-version-tabs">
            <Link className={!selection.variant ? "selected" : ""} href={protocolPath(selection.group.id)}>
              All {selection.group.label}
            </Link>
            {selection.group.variants.map((variant) => (
              <Link key={variant.id} className={selection.variant?.id === variant.id ? "selected" : ""} href={protocolPath(variant.id)}>
                {variant.label}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="protocol-detail-heading">
          <div>
            <p className="eyebrow">Analytics</p>
            <h2>{selection.label}</h2>
          </div>
          <span>{selection.markets.length} pools</span>
        </div>
        <div className="protocol-stat-grid">
          <Metric label="Markets" value={String(stats.markets)} />
          <Metric label="Total Supplied" value={formatUsd(stats.supplied)} />
          <Metric label="Total Borrowed" value={formatUsd(stats.borrowed)} />
          <Metric label="Weighted Supply APY" value={formatPct(stats.weightedSupplyApy)} />
        </div>
        <MarketTable markets={selection.markets} />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="protocol-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
