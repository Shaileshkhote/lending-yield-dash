"use client";

import { useEffect, useMemo, useState } from "react";
import { MarketTable } from "../components/MarketTable";
import { MarketTableSkeleton } from "../components/Skeletons";
import { fetchJson, type CurrentMarketsResponse } from "../lib/api";

export function MarketsPage() {
  const [data, setData] = useState<CurrentMarketsResponse | null>(null);
  const [asset, setAsset] = useState("all");
  const [chain, setChain] = useState("all");

  useEffect(() => {
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then(setData);
  }, []);

  const rows = data?.data ?? [];
  const assets = [...new Set(rows.map((row) => row.assetSymbol))];
  const chains = [...new Set(rows.map((row) => row.chain))];
  const filtered = useMemo(
    () => rows.filter((row) => (asset === "all" || row.assetSymbol === asset) && (chain === "all" || row.chain === chain)),
    [rows, asset, chain]
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Markets</p>
          <h1>Current lending table</h1>
        </div>
        <div className="filters">
          <select value={asset} onChange={(event) => setAsset(event.target.value)}>
            <option value="all">All assets</option>
            {assets.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={chain} onChange={(event) => setChain(event.target.value)}>
            <option value="all">All chains</option>
            {chains.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </header>
      <section className="panel">
        {data ? <MarketTable markets={filtered} /> : <MarketTableSkeleton rows={10} />}
      </section>
    </div>
  );
}
