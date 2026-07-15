"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart3, ExternalLink, Info, Percent, Share2, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { Bar, BarChart, Brush, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChainBadge } from "../components/ChainBadge";
import { MarketDetailSkeleton } from "../components/Skeletons";
import { TokenLogo } from "../components/TokenLogo";
import { fetchJson, formatPct, formatUsd, marketHealth, poolLinks, type CurrentMarketsResponse, type HistoryPoint, type LendingMarket, type PoolChartResponse } from "../lib/api";

type ChartMetric = "supplied" | "apy" | "borrowed";
type ChartRange = "all" | "7d" | "30d" | "90d" | "1y";

const chartTabs: Array<{ key: ChartMetric; label: string }> = [
  { key: "supplied", label: "Total Supplied" },
  { key: "apy", label: "APY" },
  { key: "borrowed", label: "Borrowed" }
];

const chartRanges: Array<{ value: ChartRange; label: string }> = [
  { value: "all", label: "All" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" }
];

export function MarketDetailPage() {
  const params = useParams<{ marketId?: string | string[] }>();
  const marketId = params?.marketId;
  const resolvedMarketId = Array.isArray(marketId) ? marketId[0] : marketId;
  const [market, setMarket] = useState<LendingMarket | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("apy");
  const [chartRange, setChartRange] = useState<ChartRange>("all");
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [isCompactChart, setIsCompactChart] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!resolvedMarketId) return;
    fetchJson<CurrentMarketsResponse>("/api/lending/markets/current").then((current) => {
      const currentMarket = current.data.find((row) => row.marketId === resolvedMarketId) ?? null;
      setMarket(currentMarket);
    });
  }, [resolvedMarketId]);

  useEffect(() => {
    if (!resolvedMarketId || !market) return;
    setHistoryLoading(true);
    fetchJson<PoolChartResponse>(`/api/lending/protocols/${market.protocolSlug}/pools/${resolvedMarketId}/chart?range=${chartRange}`)
      .then((response) => setHistory(response.data))
      .finally(() => setHistoryLoading(false));
  }, [chartRange, market, resolvedMarketId]);

  useEffect(() => {
    const update = () => setIsCompactChart(window.innerWidth <= 860);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const chartData = useMemo(
    () =>
      history.map((point) => ({
        ...point,
        date: point.timestamp,
        supplyApy: point.apyBase ?? point.supplyApy,
        netSupplyApy: point.apy ?? point.netSupplyApy,
        chartApy: point.apy ?? point.netSupplyApy ?? point.apyBase ?? point.supplyApy ?? market?.netSupplyApy ?? market?.supplyApy,
        chartBorrowApy: point.borrowApy ?? point.rewardBorrowApy ?? market?.borrowApy,
        chartSuppliedUsd: point.tvlUsd ?? point.totalSuppliedUsd ?? market?.totalSuppliedUsd,
        chartBorrowedUsd: point.totalBorrowedUsd ?? market?.totalBorrowedUsd,
        totalSuppliedUsd: point.tvlUsd ?? point.totalSuppliedUsd
      })),
    [history, market]
  );

  const apyChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0]?.netSupplyApy ?? null;
    const last = chartData[chartData.length - 1]?.netSupplyApy ?? null;
    if (first === null || last === null) return null;
    return last - first;
  }, [chartData]);

  const borrowedShare = market?.totalSuppliedUsd ? ((market.totalBorrowedUsd ?? 0) / market.totalSuppliedUsd) * 100 : null;
  const source = market?.source;
  const health = market ? marketHealth(market) : null;
  const links = market ? poolLinks(market) : null;
  const chartHeight = isCompactChart ? 360 : 430;
  const brushY = isCompactChart ? 292 : 348;
  const activeChart = useMemo(() => {
    return getChartConfig(chartMetric);
  }, [chartMetric]);

  const handleShare = async () => {
    if (!market) return;
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: `${market.assetSymbol} lending market`, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setShareState("copied");
    window.setTimeout(() => setShareState("idle"), 1600);
  };

  if (!market) {
    return <MarketDetailSkeleton />;
  }

  return (
    <div className="asset-detail-page">
      <div className="asset-main">
        <nav className="asset-breadcrumb" aria-label="Breadcrumb">
          <span>Lending Markets</span>
          <b>›</b>
          <strong>{market.assetSymbol}</strong>
        </nav>

        <header className="asset-hero">
          <div className="asset-identity">
            <TokenLogo address={market.assetAddress} chain={market.chain} symbol={market.assetSymbol} size="hero" />
            <div>
              <h1>{market.assetSymbol}</h1>
              <p>{market.protocol}</p>
            </div>
          </div>
          <div className="chain-stack">
            <span>Chains:</span>
            <ChainBadge chain={market.chain} compact />
          </div>
        </header>

        <section className="asset-stat-grid">
          <AssetStat icon={<WalletCards size={15} />} label="Supplied" value={formatUsd(market.totalSuppliedUsd)} change={formatSignedPct(-Math.abs((market.utilization ?? 0) / 8))} />
          <AssetStat icon={<BarChart3 size={15} />} label="Borrowed" value={formatUsd(market.totalBorrowedUsd)} />
          <AssetStat icon={<Percent size={15} />} label="Supply APY" hint={chartRangeLabel(chartRange)} value={formatPct(market.netSupplyApy ?? market.supplyApy)} change={formatSignedPct(apyChange)} />
          <AssetStat icon={<Info size={15} />} label="Borrow APY" value={formatPct(market.borrowApy)} />
        </section>

        <section className="asset-chart-card">
          <div className="asset-chart-tabs">
            {chartTabs.map((tab) => (
              <button key={tab.key} className={chartMetric === tab.key ? "active" : ""} type="button" onClick={() => setChartMetric(tab.key)}>
                {tab.label}
              </button>
            ))}
            <label className="range-select" aria-label="Chart range">
              <select value={chartRange} onChange={(event) => setChartRange(event.target.value as ChartRange)}>
                {chartRanges.map((range) => (
                  <option key={range.value} value={range.value}>{range.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="asset-chart">
            <ResponsiveContainer width="100%" height={chartHeight}>
              <ComposedChart data={chartData} margin={{ top: 28, right: 28, left: 8, bottom: 92 }}>
                <CartesianGrid stroke="#171717" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#777", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={chartRange === "1y" || chartRange === "all" ? 28 : 18}
                  interval="preserveStartEnd"
                  tickFormatter={(value) => formatChartAxisDate(String(value), chartRange)}
                />
                <YAxis tick={{ fill: "#777", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={activeChart.format} />
                <Tooltip
                  contentStyle={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, color: "#fff" }}
                  formatter={(value) => [activeChart.format(Number(value)), activeChart.label]}
                  labelFormatter={(label) => formatChartTooltipDate(String(label))}
                />
                {activeChart.kind === "bar" ? (
                  <Bar dataKey={activeChart.dataKey} fill="#564cff" radius={[5, 5, 0, 0]} maxBarSize={28} />
                ) : (
                  <Line type="monotone" dataKey={activeChart.dataKey} stroke="#564cff" strokeWidth={2.6} dot={false} connectNulls />
                )}
                <Brush
                  dataKey="date"
                  height={44}
                  y={brushY}
                  stroke="#9aa0ff"
                  fill="#25294d"
                  travellerWidth={8}
                  alwaysShowText={false}
                >
                  {activeChart.kind === "bar" ? (
                    <BarChart data={chartData}>
                      <Bar dataKey={activeChart.dataKey} fill="#6f68ff" maxBarSize={8} />
                    </BarChart>
                  ) : (
                    <LineChart data={chartData}>
                      <Line type="monotone" dataKey={activeChart.dataKey} stroke="#6f68ff" strokeWidth={1.4} dot={false} connectNulls />
                    </LineChart>
                  )}
                </Brush>
              </ComposedChart>
            </ResponsiveContainer>
            {historyLoading && !chartData.length ? <div className="chart-loading"><div className="skeleton-block chart" /></div> : null}
            <strong>stablewatch</strong>
          </div>
          <button className="share-chart" type="button" onClick={handleShare}>
            <Share2 size={15} />
            {shareState === "copied" ? "Copied" : "Share chart"}
          </button>
        </section>

        <section className="asset-lower-grid">
          <article className="asset-info-card">
            <div className="card-title">
              <span className="title-notch" />
              <span>Key Facts</span>
            </div>
            <dl>
              <dt>Protocol</dt>
              <dd>{market.protocol}</dd>
              <dt>Token</dt>
              <dd><TokenLogo address={market.assetAddress} chain={market.chain} symbol={market.assetSymbol} size="ticker" />{market.assetSymbol}</dd>
              <dt>Chain</dt>
              <dd><ChainBadge chain={market.chain} /></dd>
              <dt>Market Type</dt>
              <dd>{market.marketType}</dd>
              <dt>Status</dt>
              <dd><span className={`quality q-${health?.tone ?? "unreliable"}`} title={health?.reason}>{health?.label}</span></dd>
            </dl>
          </article>

          <article className="asset-info-card">
            <div className="card-title">
              <span className="title-notch" />
              <span>Market Data</span>
            </div>
            <dl>
              <dt>Total Supplied</dt>
              <dd>{formatUsd(market.totalSuppliedUsd)}</dd>
              <dt>Total Borrowed</dt>
              <dd>{formatUsd(market.totalBorrowedUsd)}</dd>
              <dt>Available Liquidity</dt>
              <dd>{formatUsd(market.availableLiquidityUsd)}</dd>
              <dt>Utilization</dt>
              <dd>{formatPct(borrowedShare ?? market.utilization)}</dd>
            </dl>
          </article>
        </section>

        <section className="asset-info-card asset-source-card">
          <div className="card-title">
            <span className="title-notch" />
            <span>Source Provenance</span>
          </div>
          <dl>
            <dt>Method</dt>
            <dd>{source?.method ?? "Protocol subgraph snapshot"}</dd>
            <dt>Payload Hash</dt>
            <dd>{source?.payloadHash ?? "Stored in daily market snapshot"}</dd>
            <dt>Contracts</dt>
            <dd>{source?.contracts?.length ? source.contracts.join(", ") : market.assetAddress}</dd>
          </dl>
        </section>
      </div>

      <aside className="asset-side-rail">
        <article className="live-payout-card">
          <div className="card-title">
            <span className="title-notch" />
            <span>Live Borrow Demand</span>
            <time>00:00:04</time>
            <i />
          </div>
          <strong>{formatUsd(market.totalBorrowedUsd)}</strong>
        </article>

        <article className="asset-about-card">
          <div className="card-title">
            <span className="title-notch" />
            <span>About</span>
          </div>
          <p>
            {market.assetSymbol} lending on {market.protocol} tracks the current state of the market, including supplied liquidity,
            borrow demand, utilization, APY, and data provenance collected from protocol subgraphs.
          </p>
          <div className="about-links">
            <a href={links?.app} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              Website
            </a>
            <a href={links?.docs} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              Docs
            </a>
          </div>
        </article>
      </aside>
    </div>
  );
}

function AssetStat({ icon, label, hint, value, change }: { icon: ReactNode; label: string; hint?: string; value: string; change?: string | null }) {
  return (
    <article className="asset-stat-card">
      <div>
        <span className="title-notch" />
        {icon}
        <p>{label}</p>
        {hint ? <em>{hint}</em> : null}
      </div>
      <strong>{value}</strong>
      {change ? <b className={change.startsWith("+") ? "up" : "down"}>{change}</b> : null}
    </article>
  );
}

function formatSignedPct(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function chartRangeLabel(range: ChartRange): string {
  return range === "all" ? "All" : range;
}

function formatChartAxisDate(value: string, range: ChartRange): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (range === "all" || range === "1y") {
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  if (range === "90d") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatChartTooltipDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function getChartConfig(metric: ChartMetric): {
  dataKey: "chartSuppliedUsd" | "chartApy" | "chartBorrowedUsd";
  label: string;
  format: (value: number) => string;
  kind: "bar" | "line";
} {
  if (metric === "supplied") return { dataKey: "chartSuppliedUsd", label: "Total Supplied", format: formatUsd, kind: "bar" };
  if (metric === "borrowed") return { dataKey: "chartBorrowedUsd", label: "Borrowed", format: formatUsd, kind: "bar" };
  return { dataKey: "chartApy", label: "APY", format: (value) => `${value.toFixed(2)}%`, kind: "line" };
}
