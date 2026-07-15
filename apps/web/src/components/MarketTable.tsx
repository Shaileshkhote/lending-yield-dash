import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPct, formatSignedPct, formatUsd, marketHealth, type LendingMarket } from "../lib/api";
import { TokenLogo } from "./TokenLogo";

type Props = {
  markets: LendingMarket[];
};

type SortKey = "asset" | "supplied" | "borrowed" | "utilization" | "sevenDayApy" | "apySevenDayChange" | "thirtyDayApy" | "borrowApy" | "quality";
type SortDirection = "asc" | "desc";

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "asset", label: "Asset" },
  { key: "supplied", label: "Total Supplied" },
  { key: "borrowed", label: "Total Borrowed" },
  { key: "utilization", label: "Utilization" },
  { key: "sevenDayApy", label: "7d APY" },
  { key: "apySevenDayChange", label: "APY 7d Change" },
  { key: "thirtyDayApy", label: "30d APY" },
  { key: "borrowApy", label: "Borrow APY" },
  { key: "quality", label: "Status" }
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
                  <TokenLogo address={market.assetAddress} chain={market.chain} symbol={market.assetSymbol} size="market" />
                  <span className="asset-copy">
                  <strong>{market.assetSymbol}</strong>
                  <span>
                    {market.protocol}
                  </span>
                  </span>
                </Link>
              </td>
              <td>{formatUsd(market.totalSuppliedUsd)}</td>
              <td>{formatUsd(market.totalBorrowedUsd)}</td>
              <td>{formatPct(market.utilization)}</td>
              <td><span className={apyTone(market.sevenDayApy)}>{formatPct(market.sevenDayApy)}</span></td>
              <td><span className={apyTone(market.apySevenDayChange)}>{formatSignedPct(market.apySevenDayChange)}</span></td>
              <td><span className={apyTone(market.thirtyDayApy)}>{formatPct(market.thirtyDayApy)}</span></td>
              <td><span className={apyTone(market.borrowApy)}>{formatPct(market.borrowApy)}</span></td>
              <td>
                <HealthBadge market={market} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HealthBadge({ market }: { market: LendingMarket }) {
  const health = marketHealth(market);
  return (
    <span className={`quality q-${health.tone}`} title={health.reason}>
      {health.label}
    </span>
  );
}

function apyTone(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

function sortValue(market: LendingMarket, key: SortKey): string | number {
  if (key === "asset") return `${market.assetSymbol} ${market.protocol} ${market.chain}`;
  if (key === "supplied") return market.totalSuppliedUsd ?? 0;
  if (key === "borrowed") return market.totalBorrowedUsd ?? 0;
  if (key === "utilization") return market.utilization ?? 0;
  if (key === "sevenDayApy") return market.sevenDayApy ?? Number.NEGATIVE_INFINITY;
  if (key === "apySevenDayChange") return market.apySevenDayChange ?? 0;
  if (key === "thirtyDayApy") return market.thirtyDayApy ?? Number.NEGATIVE_INFINITY;
  if (key === "borrowApy") return market.borrowApy ?? 0;
  return market.dataQualityScore ?? 0;
}
