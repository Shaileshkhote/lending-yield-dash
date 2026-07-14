import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPct, formatUsd, qualityLabel, type LendingMarket } from "../lib/api";
import { TokenLogo } from "./TokenLogo";

type Props = {
  markets: LendingMarket[];
};

type SortKey = "asset" | "supplied" | "borrowed" | "utilization" | "supplyApy" | "borrowApy" | "quality";
type SortDirection = "asc" | "desc";

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "asset", label: "Asset" },
  { key: "supplied", label: "Total Supplied" },
  { key: "borrowed", label: "Total Borrowed" },
  { key: "utilization", label: "Utilization" },
  { key: "supplyApy", label: "Supply APY" },
  { key: "borrowApy", label: "Borrow APY" },
  { key: "quality", label: "Quality" }
];

export function MarketTable({ markets }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("supplied");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedMarkets = useMemo(
    () =>
      [...markets].sort((a, b) => {
        const left = sortValue(a, sortKey);
        const right = sortValue(b, sortKey);
        const direction = sortDirection === "asc" ? 1 : -1;
        if (typeof left === "string" && typeof right === "string") return left.localeCompare(right) * direction;
        return ((left as number) - (right as number)) * direction;
      }),
    [markets, sortDirection, sortKey]
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "asset" ? "asc" : "desc");
  };

  return (
    <div className="table-wrap">
      <table className="market-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>
                <button className="sort-button" type="button" onClick={() => toggleSort(column.key)}>
                  {column.label}
                  <span className="sort-mark">{sortKey === column.key ? (sortDirection === "asc" ? "Ξ↑" : "Ξ↓") : "Ξ↕"}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedMarkets.map((market) => (
            <tr key={market.marketId}>
              <td>
                <Link className="market-link" href={`/lending/markets/${market.marketId}`}>
                  <TokenLogo symbol={market.assetSymbol} size="market" />
                  <span className="asset-copy">
                  <strong>{market.assetSymbol}</strong>
                  <span>
                    {market.protocol} / {market.chain}
                  </span>
                  </span>
                </Link>
              </td>
              <td>{formatUsd(market.totalSuppliedUsd)}</td>
              <td>{formatUsd(market.totalBorrowedUsd)}</td>
              <td>{formatPct(market.utilization)}</td>
              <td>{formatPct(market.netSupplyApy ?? market.supplyApy)}</td>
              <td>{formatPct(market.borrowApy)}</td>
              <td>
                <span className={`quality q-${qualityLabel(market.dataQualityScore).toLowerCase()}`}>
                  {qualityLabel(market.dataQualityScore)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function sortValue(market: LendingMarket, key: SortKey): string | number {
  if (key === "asset") return `${market.assetSymbol} ${market.protocol} ${market.chain}`;
  if (key === "supplied") return market.totalSuppliedUsd ?? 0;
  if (key === "borrowed") return market.totalBorrowedUsd ?? 0;
  if (key === "utilization") return market.utilization ?? 0;
  if (key === "supplyApy") return market.netSupplyApy ?? market.supplyApy ?? 0;
  if (key === "borrowApy") return market.borrowApy ?? 0;
  return market.dataQualityScore ?? 0;
}
