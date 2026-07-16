"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MarketTable } from "../components/MarketTable";
import { MarketTableSkeleton } from "../components/Skeletons";
import { fetchJson, type CurrentMarketsResponse } from "../lib/api";
import { assetTypeForMarket, assetTypeOptions } from "../lib/asset-types";

export function MarketsPage() {
  const [data, setData] = useState<CurrentMarketsResponse | null>(null);
  const [asset, setAsset] = useState("all");
  const [chain, setChain] = useState("all");
  const [protocol, setProtocol] = useState("all");
  const [query, setQuery] = useState("");
  const [assetType, setAssetType] = useState("all");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAsset(params.get("asset") ?? "all");
    setChain(params.get("chain") ?? "all");
    setProtocol(params.get("protocol") ?? "all");
    setQuery(params.get("q") ?? "");
    setAssetType(params.get("type") ?? "all");
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then(setData);
  }, []);

  const rows = data?.data ?? [];
  const assets = useMemo(() => [...new Set(rows.map((row) => row.assetSymbol))].sort(), [rows]);
  const chains = useMemo(() => [...new Set(rows.map((row) => row.chain))].sort(), [rows]);
  const protocols = useMemo(() => [...new Set(rows.map((row) => row.protocol))].sort(), [rows]);
  const filtered = useMemo(
    () => {
      const normalized = deferredQuery.trim().toLowerCase();
      return rows.filter((row) => {
        const matchesQuery = normalized
          ? [row.assetSymbol, row.protocol, row.chain, row.marketId].some((value) => value.toLowerCase().includes(normalized))
          : true;
        const matchesAsset = asset === "all" || row.assetSymbol === asset;
        const matchesChain = chain === "all" || row.chain === chain;
        const matchesProtocol = protocol === "all" || row.protocol === protocol;
        const matchesAssetType = assetType === "all" || assetTypeForMarket(row) === assetType;
        return matchesQuery && matchesAsset && matchesChain && matchesProtocol && matchesAssetType;
      });
    },
    [asset, assetType, chain, deferredQuery, protocol, rows]
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Markets</p>
          <h1>Current lending table</h1>
        </div>
      </header>
      <section className="market-panel markets-page-panel">
        <div className="filters">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets" />
          <label className="filter-select">
            <select value={assetType} onChange={(event) => setAssetType(event.target.value)}>
              {assetTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-select">
            <select value={asset} onChange={(event) => setAsset(event.target.value)}>
              <option value="all">All tokens</option>
              {assets.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-select">
            <select value={chain} onChange={(event) => setChain(event.target.value)}>
              <option value="all">All chains</option>
              {chains.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-select">
            <select value={protocol} onChange={(event) => setProtocol(event.target.value)}>
              <option value="all">All protocols</option>
              {protocols.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
        {data ? <MarketTable markets={filtered} /> : <MarketTableSkeleton rows={10} />}
      </section>
    </div>
  );
}
