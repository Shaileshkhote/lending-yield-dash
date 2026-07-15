export function LendingOverviewSkeleton() {
  return (
    <div className="analytics-page skeleton-page" aria-busy="true">
      <section className="hero-grid">
        <article className="analytics-card trending-card skeleton-card">
          <SkeletonTitle />
          {Array.from({ length: 5 }, (_, index) => (
            <div className="skeleton-row compact" key={index}>
              <span className="skeleton-dot" />
              <span className="skeleton-line wide" />
              <span className="skeleton-line value" />
            </div>
          ))}
        </article>
        <div className="center-stack">
          <article className="payout-card skeleton-card">
            <span className="skeleton-line label" />
            <strong className="skeleton-line hero" />
          </article>
          <div className="mini-grid">
            <MetricSkeleton />
            <MetricSkeleton />
          </div>
        </div>
        <article className="analytics-card research-card skeleton-card">
          <SkeletonTitle />
          <div className="skeleton-block art" />
          <span className="skeleton-line wide" />
          <span className="skeleton-line short" />
        </article>
      </section>
      <section className="market-panel skeleton-card">
        <div className="category-tabs">
          <span className="skeleton-line tab" />
          <span className="skeleton-line tab" />
          <span className="skeleton-line tab" />
        </div>
        <div className="filter-row">
          <span className="skeleton-line search" />
          <span className="skeleton-line button" />
        </div>
        <MarketTableSkeleton rows={8} />
      </section>
    </div>
  );
}

export function MarketTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="table-wrap skeleton-table" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-table-row" key={index}>
          <span className="skeleton-dot" />
          <span className="skeleton-line wide" />
          <span className="skeleton-line value" />
          <span className="skeleton-line value" />
          <span className="skeleton-line value" />
          <span className="skeleton-line value" />
          <span className="skeleton-line value" />
          <span className="skeleton-line value" />
          <span className="skeleton-line chip" />
        </div>
      ))}
    </div>
  );
}

export function MarketDetailSkeleton() {
  return (
    <div className="asset-detail-page skeleton-page" aria-busy="true">
      <div className="asset-main">
        <div className="asset-breadcrumb">
          <span className="skeleton-line short" />
        </div>
        <header className="asset-hero">
          <div className="asset-identity">
            <span className="skeleton-avatar large" />
            <div>
              <span className="skeleton-line title" />
              <span className="skeleton-line short" />
            </div>
          </div>
        </header>
        <section className="asset-stat-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <article className="asset-stat-card skeleton-card" key={index}>
              <span className="skeleton-line label" />
              <span className="skeleton-line metric" />
            </article>
          ))}
        </section>
        <section className="asset-chart-card skeleton-card">
          <div className="asset-chart-tabs">
            <span className="skeleton-line tab" />
            <span className="skeleton-line tab" />
            <span className="skeleton-line tab" />
          </div>
          <div className="asset-chart">
            <div className="skeleton-block chart" />
          </div>
        </section>
      </div>
      <aside className="asset-side-rail">
        <article className="live-payout-card skeleton-card">
          <SkeletonTitle />
          <span className="skeleton-line hero" />
        </article>
        <article className="asset-about-card skeleton-card">
          <SkeletonTitle />
          <span className="skeleton-line wide" />
          <span className="skeleton-line wide" />
          <span className="skeleton-line short" />
        </article>
      </aside>
    </div>
  );
}

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="page skeleton-page" aria-busy="true">
      <header className="page-header">
        <div>
          <span className="skeleton-line label" />
          <span className="skeleton-line title" />
        </div>
      </header>
      <section className="panel skeleton-card">
        <MarketTableSkeleton rows={rows} />
      </section>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <article className="analytics-card metric-panel skeleton-card">
      <SkeletonTitle />
      <span className="skeleton-line metric" />
      <div className="skeleton-block mini-chart" />
    </article>
  );
}

function SkeletonTitle() {
  return (
    <div className="card-title skeleton-title">
      <span className="title-notch" />
      <span className="skeleton-line label" />
    </div>
  );
}
