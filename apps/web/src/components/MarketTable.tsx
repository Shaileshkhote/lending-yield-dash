import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { formatPct, formatSignedPct, formatUsd, marketHealth, type LendingMarket } from "../lib/api";
import { TokenLogo } from "./TokenLogo";

type Props = {
  markets: LendingMarket[];
  visibleColumns?: MarketColumnKey[];
};

export type MarketColumnKey = "asset" | "supplied" | "borrowed" | "utilization" | "sevenDayApy" | "apySevenDayChange" | "thirtyDayApy" | "borrowApy" | "quality";
type SortKey = MarketColumnKey;
type SortDirection = "asc" | "desc";

export const marketColumns: Array<{ key: MarketColumnKey; label: string; canHide: boolean }> = [
  { key: "asset", label: "Asset", canHide: false },
  { key: "supplied", label: "Total Supplied", canHide: true },
  { key: "borrowed", label: "Total Borrowed", canHide: true },
  { key: "utilization", label: "Utilization", canHide: true },
  { key: "sevenDayApy", label: "7d APY", canHide: true },
  { key: "apySevenDayChange", label: "APY 7d Change", canHide: true },
  { key: "thirtyDayApy", label: "30d APY", canHide: true },
  { key: "borrowApy", label: "Borrow APY", canHide: true },
  { key: "quality", label: "Status", canHide: true }
];

const defaultColumns = marketColumns.map((column) => column.key);

const columnCells: Record<MarketColumnKey, (market: LendingMarket) => ReactNode> = {
  asset: (market) => (
    <Link className="market-link" href={`/lending/markets/${market.marketId}`}>
      <TokenLogo address={market.assetAddress} chain={market.chain} symbol={market.assetSymbol} size="market" />
      <span className="asset-copy">
        <strong>{market.assetSymbol}</strong>
        <span>{market.protocol}</span>
      </span>
    </Link>
  ),
  supplied: (market) => formatUsd(market.totalSuppliedUsd),
  borrowed: (market) => formatUsd(market.totalBorrowedUsd),
  utilization: (market) => formatPct(market.utilization),
  sevenDayApy: (market) => <span className={apyTone(market.sevenDayApy)}>{formatPct(market.sevenDayApy)}</span>,
  apySevenDayChange: (market) => <span className={apyTone(market.apySevenDayChange)}>{formatSignedPct(market.apySevenDayChange)}</span>,
  thirtyDayApy: (market) => <span className={apyTone(market.thirtyDayApy)}>{formatPct(market.thirtyDayApy)}</span>,
  borrowApy: (market) => <span className={apyTone(market.borrowApy)}>{formatPct(market.borrowApy)}</span>,
  quality: (market) => <HealthBadge market={market} />
};

export const hideableMarketColumns = marketColumns.filter((column) => column.canHide);

export const defaultMarketColumns = defaultColumns;

export const requiredMarketColumns = marketColumns.filter((column) => !column.canHide).map((column) => column.key);

export function MarketTable({ markets, visibleColumns = defaultColumns }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("supplied");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const visibleColumnSet = useMemo(() => new Set([...requiredMarketColumns, ...visibleColumns]), [visibleColumns]);
  const columns = useMemo(
    () => marketColumns.filter((column) => visibleColumnSet.has(column.key)),
    [visibleColumnSet]
  );

  useEffect(() => {
    if (!visibleColumnSet.has(sortKey)) {
      setSortKey(columns[0]?.key ?? "asset");
    }
  }, [columns, sortKey, visibleColumnSet]);

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
              {columns.map((column) => (
                <td key={column.key}>{columnCells[column.key](market)}</td>
              ))}
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
