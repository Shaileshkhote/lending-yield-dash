"use client";

import { useEffect, useState } from "react";
import { Github } from "lucide-react";
import { PageSkeleton } from "../components/Skeletons";
import { fetchJson, type CurrentMarketsResponse, type LendingMarket } from "../lib/api";

const INITIAL_VISIBLE_SOURCES = 36;
const SOURCE_BATCH_SIZE = 72;

export function SourcesPage() {
  const [markets, setMarkets] = useState<LendingMarket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_SOURCES);

  useEffect(() => {
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current")
      .then((response) => setMarkets(response.data))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <PageSkeleton rows={6} />;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Methodology</p>
          <h1>Adapter sources, provenance, and implementation</h1>
          <p className="page-subtitle">Independent technical prototype for open lending analytics, built from public protocol data.</p>
        </div>
        <a className="contact-button" href="https://github.com/Shaileshkhote/lending-yield-dash" target="_blank" rel="noreferrer">
          <Github size={16} />
          GitHub
        </a>
      </header>
      <section className="panel methodology-summary">
        <article>
          <h2>Collection</h2>
          <p>Self-contained protocol adapters normalize lending markets from protocol on-chain events, subgraphs, and Dune data.</p>
        </article>
        <article>
          <h2>Storage</h2>
          <p>Postgres stores daily snapshots and provenance; R2 serves materialized JSON for fast dashboard reads.</p>
        </article>
        <article>
          <h2>Quality</h2>
          <p>Checks classify freshness, paused markets, inactive markets, collateral-only markets, and stale data.</p>
        </article>
      </section>
      <section className="panel source-list">
        {markets.slice(0, visibleCount).map((market) => (
          <article key={market.marketId} className="source-card">
            <div>
              <h2>{market.marketId}</h2>
              <p>
                {market.protocol} / {market.chain} / {market.assetSymbol}
              </p>
            </div>
            <dl>
              <dt>Adapter</dt>
              <dd>{market.protocolSlug}</dd>
              <dt>Method</dt>
              <dd>{market.source?.method ?? "Protocol on-chain events, subgraphs, or Dune data"}</dd>
              <dt>Payload hash</dt>
              <dd>{market.source?.payloadHash ?? "Stored in daily market snapshot"}</dd>
            </dl>
          </article>
        ))}
        {visibleCount < markets.length ? (
          <div className="source-load-row">
            <span>
              {visibleCount} / {markets.length}
            </span>
            <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + SOURCE_BATCH_SIZE, markets.length))}>
              Show more
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
