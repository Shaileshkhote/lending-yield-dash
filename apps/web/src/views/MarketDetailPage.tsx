"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart3, ExternalLink, Info, Percent, Share2, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { Bar, Brush, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

const DESKTOP_CHART_POINTS = 420;
const COMPACT_CHART_POINTS = 220;
const DESKTOP_BAR_POINTS = 240;
const COMPACT_BAR_POINTS = 140;
const chartTooltipStyle = {
  background: "var(--chart-tooltip-bg)",
  border: "1px solid var(--chart-tooltip-border)",
  borderRadius: 12,
  color: "var(--chart-tooltip-text)"
};

type ChartDatum = HistoryPoint & {
  date: string;
  chartApy?: number | null;
  chartBorrowApy?: number | null;
  chartSuppliedUsd?: number | null;
  chartBorrowedUsd?: number | null;
};

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
  const chartRef = useRef<HTMLDivElement | null>(null);

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

  const chartData = useMemo<ChartDatum[]>(
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
  const activeChart = useMemo(() => {
    return getChartConfig(chartMetric);
  }, [chartMetric]);
  const chartRenderData = useMemo(
    () => {
      const maxPoints = chartPointLimit(activeChart.kind, isCompactChart);
      return downsampleChartData(chartData, maxPoints);
    },
    [activeChart.kind, chartData, isCompactChart]
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

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || activeChart.kind !== "line") return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paths = Array.from(chart.querySelectorAll<SVGGeometryElement>(".recharts-line-curve"));

    paths.forEach((path) => {
      if (reduceMotion || typeof path.getTotalLength !== "function") {
        path.style.strokeDasharray = "";
        path.style.strokeDashoffset = "";
        path.style.transition = "";
        return;
      }

      const length = Math.ceil(path.getTotalLength());
      path.style.transition = "none";
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      path.getBoundingClientRect();
      path.style.transition = "stroke-dashoffset 680ms ease-out";
      path.style.strokeDashoffset = "0";
    });
  }, [activeChart.kind, chartRenderData, chartMetric]);

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
          <div ref={chartRef} className={activeChart.kind === "line" ? "asset-chart draw-chart" : "asset-chart"}>
            <MemoizedMarketChart
              activeChart={activeChart}
              brushY={brushY}
              chartData={chartRenderData}
              chartHeight={chartHeight}
              chartRange={chartRange}
            />
            {historyLoading && !chartData.length ? <div className="chart-loading"><div className="skeleton-block chart" /></div> : null}
            <strong>LendStack</strong>
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
            <div className="asset-fact-list">
              <FactRow label="Protocol">{market.protocol}</FactRow>
              <FactRow label="Token">
                <span className="asset-fact-inline">
                  <TokenLogo address={market.assetAddress} chain={market.chain} symbol={market.assetSymbol} size="ticker" />
                  <span>{market.assetSymbol}</span>
                </span>
              </FactRow>
              <FactRow label="Chain">
                <ChainBadge chain={market.chain} />
              </FactRow>
              <FactRow label="Market Type">{formatMarketType(market.marketType)}</FactRow>
              <FactRow label="Status">
                <span className={`quality q-${health?.tone ?? "unreliable"}`} title={health?.reason}>{health?.label}</span>
              </FactRow>
            </div>
          </article>

          <article className="asset-info-card">
            <div className="card-title">
              <span className="title-notch" />
              <span>Market Data</span>
            </div>
            <div className="asset-fact-list">
              <FactRow label="Total Supplied">{formatUsd(market.totalSuppliedUsd)}</FactRow>
              <FactRow label="Total Borrowed">{formatUsd(market.totalBorrowedUsd)}</FactRow>
              <FactRow label="Available Liquidity">{formatUsd(market.availableLiquidityUsd)}</FactRow>
              <FactRow label="Utilization">{formatPct(borrowedShare ?? market.utilization)}</FactRow>
              <FactRow label="Updated">{formatUpdatedAt(market.lastUpdated)}</FactRow>
            </div>
          </article>
        </section>

        <section className="asset-info-card asset-source-card">
          <div className="card-title">
            <span className="title-notch" />
            <span>Source Provenance</span>
          </div>
          <div className="asset-fact-list">
            <FactRow label="Method">{source?.method ?? "Protocol on-chain events, subgraphs, or Dune data"}</FactRow>
            <FactRow label="Payload Hash" valueClassName="asset-fact-mono">{source?.payloadHash ?? "Stored in daily market snapshot"}</FactRow>
            <FactRow label="Contracts" valueClassName="asset-fact-mono">{formatContracts(source?.contracts, market.assetAddress)}</FactRow>
          </div>
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
            borrow demand, utilization, APY, and data provenance collected from protocol on-chain events, subgraphs, and Dune data.
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

function FactRow({ label, children, valueClassName }: { label: string; children: ReactNode; valueClassName?: string }) {
  return (
    <div className="asset-fact-row">
      <span className="asset-fact-label">{label}</span>
      <span className={`asset-fact-value${valueClassName ? ` ${valueClassName}` : ""}`}>{children}</span>
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

type ChartConfig = ReturnType<typeof getChartConfig>;

const MemoizedMarketChart = memo(function MarketChart({
  activeChart,
  brushY,
  chartData,
  chartHeight,
  chartRange,
}: {
  activeChart: ChartConfig;
  brushY: number;
  chartData: ChartDatum[];
  chartHeight: number;
  chartRange: ChartRange;
}) {
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <ComposedChart data={chartData} margin={{ top: 28, right: 28, left: 8, bottom: 92 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          minTickGap={chartRange === "1y" || chartRange === "all" ? 28 : 18}
          interval="preserveStartEnd"
          tickFormatter={(value) => formatChartAxisDate(String(value), chartRange)}
        />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={activeChart.format} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          formatter={(value) => [activeChart.format(Number(value)), activeChart.label]}
          labelFormatter={(label) => formatChartTooltipDate(String(label))}
        />
        {activeChart.kind === "bar" ? (
          <Bar dataKey={activeChart.dataKey} fill="var(--chart-primary)" radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        ) : (
          <Line type="monotone" dataKey={activeChart.dataKey} stroke="var(--chart-primary)" strokeWidth={2.6} dot={false} activeDot={false} connectNulls isAnimationActive={false} />
        )}
        <Brush dataKey="date" height={44} y={brushY} stroke="var(--chart-brush-stroke)" fill="var(--chart-brush-bg)" travellerWidth={8} alwaysShowText={false}>
          <LineChart data={chartData}>
            <Line type="monotone" dataKey={activeChart.dataKey} stroke="var(--chart-primary-soft)" strokeWidth={1.4} dot={false} activeDot={false} connectNulls isAnimationActive={false} />
          </LineChart>
        </Brush>
      </ComposedChart>
    </ResponsiveContainer>
  );
});

function downsampleChartData<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data;
  const step = (data.length - 1) / (maxPoints - 1);
  const sampled: T[] = [];
  let previousIndex = -1;

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = index === maxPoints - 1 ? data.length - 1 : Math.floor(index * step);
    if (sourceIndex !== previousIndex) sampled.push(data[sourceIndex]);
    previousIndex = sourceIndex;
  }

  return sampled;
}

function chartPointLimit(kind: ChartConfig["kind"], compact: boolean): number {
  if (kind === "bar") return compact ? COMPACT_BAR_POINTS : DESKTOP_BAR_POINTS;
  return compact ? COMPACT_CHART_POINTS : DESKTOP_CHART_POINTS;
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

function formatMarketType(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function formatContracts(contracts: unknown, fallback: string): string {
  if (Array.isArray(contracts) && contracts.length) {
    return contracts.map(String).join(", ");
  }
  if (typeof contracts === "string" && contracts.length) {
    return contracts;
  }
  return fallback;
}
