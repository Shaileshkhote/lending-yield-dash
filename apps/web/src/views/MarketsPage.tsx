"use client";

import { useEffect, useMemo, useState } from "react";
import { MarketTable } from "../components/MarketTable";
import { MarketTableSkeleton } from "../components/Skeletons";
import { fetchJson, type CurrentMarketsResponse } from "../lib/api";

export function MarketsPage() {
  const [data, setData] = useState<CurrentMarketsResponse | null>(null);
  const [asset, setAsset] = useState("all");
  const [chain, setChain] = useState("all");
  const [protocol, setProtocol] = useState("all");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAsset(params.get("asset") ?? "all");
    setChain(params.get("chain") ?? "all");
    setProtocol(params.get("protocol") ?? "all");
    setQuery(params.get("q") ?? "");
    setRange(params.get("range") ?? "all");
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then(setData);
  }, []);

  const rows = data?.data ?? [];
  const assets = [...new Set(rows.map((row) => row.assetSymbol))];
  const chains = [...new Set(rows.map((row) => row.chain))];
  const protocols = [...new Set(rows.map((row) => row.protocol))];
  const filtered = useMemo(
    () => {
      const normalized = query.trim().toLowerCase();
      const rangeDays = range === "all" ? null : Number(range.replace("d", ""));
      const now = Date.now();
      return rows.filter((row) => {
        const matchesQuery = normalized
          ? [row.assetSymbol, row.protocol, row.chain, row.marketId].some((value) => value.toLowerCase().includes(normalized))
          : true;
        const matchesAsset = asset === "all" || row.assetSymbol === asset;
        const matchesChain = chain === "all" || row.chain === chain;
        const matchesProtocol = protocol === "all" || row.protocol === protocol;
        const lastUpdated = Date.parse(row.lastUpdated);
        const matchesRange = !rangeDays || !Number.isFinite(lastUpdated) || now - lastUpdated <= rangeDays * 24 * 60 * 60 * 1000;
        return matchesQuery && matchesAsset && matchesChain && matchesProtocol && matchesRange;
      });
    },
    [asset, chain, protocol, query, range, rows]
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Markets</p>
          <h1>Current lending table</h1>
        </div>
        <div className="filters">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets" />
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
          <select value={protocol} onChange={(event) => setProtocol(event.target.value)}>
            <option value="all">All protocols</option>
            {protocols.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            <option value="all">All ranges</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="90d">90d</option>
            <option value="365d">1y</option>
          </select>
        </div>
      </header>
      <section className="panel">
        {data ? <MarketTable markets={filtered} /> : <MarketTableSkeleton rows={10} />}
      </section>
    </div>
  );
}
