"use client";

import { useEffect, useState } from "react";
import { ChainBadge } from "../components/ChainBadge";
import { PageSkeleton } from "../components/Skeletons";
import { TokenLogo } from "../components/TokenLogo";
import { fetchJson, formatUsd, marketHealth, type CurrentMarketsResponse, type LendingMarket } from "../lib/api";

const INITIAL_VISIBLE_ROWS = 240;
const ROW_BATCH_SIZE = 240;

export function QualityPage() {
  const [markets, setMarkets] = useState<LendingMarket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);

  useEffect(() => {
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current")
      .then((response) => setMarkets(response.data))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <PageSkeleton rows={7} />;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Quality</p>
          <h1>Market sync health</h1>
        </div>
      </header>
      <section className="panel">
        <div className="table-wrap quality-table-wrap">
          <table className="market-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Chain</th>
                <th>Status</th>
                <th>Supplied</th>
                <th>Updated</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {markets.slice(0, visibleCount).map((market) => {
                const health = marketHealth(market);
                return (
                  <tr key={market.marketId}>
                    <td>
                      <span className="quality-market">
                        <TokenLogo address={market.assetAddress} chain={market.chain} symbol={market.assetSymbol} size="market" />
                        <span>
                          <strong>{market.assetSymbol}</strong>
                          <small>{market.protocol}</small>
                        </span>
                      </span>
                    </td>
                    <td><ChainBadge chain={market.chain} compact /></td>
                    <td>
                      <span className={`quality q-${health.tone}`}>{health.label}</span>
                    </td>
                    <td>{formatUsd(market.totalSuppliedUsd)}</td>
                    <td>{new Date(market.lastUpdated).toISOString().slice(0, 10)}</td>
                    <td>{health.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleCount < markets.length ? (
            <div className="table-load-row">
              <span>
                {visibleCount} / {markets.length}
              </span>
              <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + ROW_BATCH_SIZE, markets.length))}>
                Show more
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
