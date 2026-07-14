"use client";

import { useEffect, useState } from "react";
import { fetchJson, type CurrentMarketsResponse, type LendingMarket } from "../lib/api";

export function SourcesPage() {
  const [markets, setMarkets] = useState<LendingMarket[]>([]);

  useEffect(() => {
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then((response) => setMarkets(response.data));
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Sources</p>
          <h1>Adapter sources and provenance</h1>
        </div>
      </header>
      <section className="panel source-list">
        {markets.map((market) => (
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
              <dd>{market.source.method}</dd>
              <dt>Payload hash</dt>
              <dd>{market.source.payloadHash}</dd>
            </dl>
          </article>
        ))}
      </section>
    </div>
  );
}
