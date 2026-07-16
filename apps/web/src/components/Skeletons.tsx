export function LendingOverviewSkeleton() {
  return (
    <div className="analytics-page skeleton-page" aria-busy="true">
      <section className="prototype-note skeleton-card">
        <span className="skeleton-line search top-market-search" />
        <div>
          <span className="skeleton-line button" />
          <span className="skeleton-line button" />
        </div>
      </section>
      <section className="hero-grid">
        <article className="analytics-card trending-card skeleton-card">
          <SkeletonTitle />
          {Array.from({ length: 5 }, (_, index) => (
            <div className="skeleton-row compact" key={index}>
              <span className="skeleton-line rank" />
              <span className="skeleton-dot" />
              <span className="skeleton-line wide" />
              <span className="skeleton-line value" />
            </div>
          ))}
        </article>
        <div className="center-stack">
          <article className="payout-card methodology-payout-card skeleton-card">
            <span className="skeleton-line label" />
            <strong className="skeleton-line hero" />
            <span className="skeleton-line wide" />
            <div className="pipeline-steps skeleton-pipeline-steps">
              <span className="skeleton-line chip" />
              <span className="skeleton-line chip" />
              <span className="skeleton-line chip" />
              <span className="skeleton-line chip" />
            </div>
          </article>
          <div className="mini-grid">
            {Array.from({ length: 3 }, (_, index) => (
              <MetricSkeleton key={index} />
            ))}
          </div>
        </div>
      </section>
      <section className="market-panel skeleton-card">
        <div className="filter-pill-row">
          <div className="filter-left-group">
            <span className="skeleton-line button" />
            <span className="skeleton-line button" />
            <span className="skeleton-line button" />
            <span className="skeleton-line button" />
          </div>
          <div className="filter-right-group">
            <span className="skeleton-line button" />
          </div>
        </div>
        <MarketTableSkeleton rows={8} />
      </section>
    </div>
  );
}

export function MarketTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="table-wrap skeleton-table" aria-busy="true">
      <div className="skeleton-market-head">
        {["Asset", "Total Supplied", "Total Borrowed", "Utilization", "7d APY", "APY 7d Change", "30d APY", "Borrow APY", "Status"].map((label) => (
          <span className="skeleton-line label" key={label} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-table-row" key={index}>
          <span className="skeleton-market-asset">
            <span className="skeleton-dot" />
            <span>
              <span className="skeleton-line short" />
              <span className="skeleton-line label" />
            </span>
          </span>
          {Array.from({ length: 7 }, (_, valueIndex) => (
            <span className="skeleton-line value" key={valueIndex} />
          ))}
          <span className="skeleton-line chip" />
        </div>
      ))}
    </div>
  );
}

export function MarketsPageSkeleton() {
  return (
    <div className="page skeleton-page" aria-busy="true">
      <SkeletonPageHeader eyebrowWidth="74px" titleWidth="265px" />
      <section className="market-panel markets-page-panel skeleton-card">
        <div className="filters skeleton-filters">
          <span className="skeleton-line search" />
          {Array.from({ length: 4 }, (_, index) => (
            <span className="skeleton-line button" key={index} />
          ))}
        </div>
        <MarketTableSkeleton rows={10} />
      </section>
    </div>
  );
}

export function ProtocolsPageSkeleton() {
  return (
    <div className="page skeleton-page" aria-busy="true">
      <SkeletonPageHeader eyebrowWidth="76px" titleWidth="142px" />
      <section className="market-panel protocol-directory-panel skeleton-card">
        <div className="protocol-directory-head skeleton-protocol-head">
          <span className="skeleton-line label" />
          <span className="skeleton-line label" />
          <span className="skeleton-line label" />
          <span className="skeleton-line label" />
          <span aria-hidden="true" />
        </div>
        <div className="protocol-list">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="protocol-row skeleton-protocol-row" key={index}>
              <span className="protocol-left">
                <span className="skeleton-dot" />
                <span>
                  <span className="skeleton-line short" />
                  <span className="skeleton-line label" />
                </span>
              </span>
              <span className="skeleton-chain-stack">
                <span className="skeleton-dot mini" />
                <span className="skeleton-dot mini" />
                <span className="skeleton-dot mini" />
              </span>
              <span className="skeleton-line value" />
              <span className="skeleton-line value compact-value" />
              <span className="skeleton-line arrow" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ProtocolDetailSkeleton() {
  return (
    <div className="page skeleton-page" aria-busy="true">
      <header className="page-header">
        <div>
          <span className="skeleton-line label" />
          <span className="skeleton-line title" />
          <span className="skeleton-line wide" />
          <div className="protocol-link-row">
            <span className="skeleton-line chip" />
            <span className="skeleton-line chip" />
            <span className="skeleton-line chip" />
          </div>
        </div>
        <span className="skeleton-line button" />
      </header>
      <section className="protocol-detail skeleton-card">
        <div className="protocol-version-tabs">
          <span className="skeleton-line chip" />
          <span className="skeleton-line chip" />
          <span className="skeleton-line chip" />
        </div>
        <div className="protocol-detail-heading">
          <div>
            <span className="skeleton-line label" />
            <span className="skeleton-line title" />
          </div>
          <span className="skeleton-line chip" />
        </div>
        <div className="protocol-stat-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <article className="protocol-stat" key={index}>
              <span className="skeleton-line label" />
              <strong className="skeleton-line metric" />
            </article>
          ))}
        </div>
        <MarketTableSkeleton rows={8} />
      </section>
    </div>
  );
}

export function QualityPageSkeleton() {
  return (
    <div className="page skeleton-page" aria-busy="true">
      <SkeletonPageHeader eyebrowWidth="62px" titleWidth="235px" />
      <section className="panel skeleton-card">
        <div className="table-wrap quality-table-wrap skeleton-quality-table">
          <div className="skeleton-quality-head">
            {Array.from({ length: 6 }, (_, index) => (
              <span className="skeleton-line label" key={index} />
            ))}
          </div>
          {Array.from({ length: 8 }, (_, index) => (
            <div className="skeleton-quality-row" key={index}>
              <span className="quality-market">
                <span className="skeleton-dot" />
                <span>
                  <span className="skeleton-line short" />
                  <span className="skeleton-line label" />
                </span>
              </span>
              <span className="skeleton-line chip" />
              <span className="skeleton-line chip" />
              <span className="skeleton-line value" />
              <span className="skeleton-line value" />
              <span className="skeleton-line wide" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function SourcesPageSkeleton() {
  return (
    <div className="page skeleton-page" aria-busy="true">
      <header className="page-header">
        <div>
          <span className="skeleton-line label" />
          <span className="skeleton-line title long" />
          <span className="skeleton-line wide" />
        </div>
        <span className="skeleton-line button" />
      </header>
      <section className="panel methodology-summary skeleton-methodology-summary">
        {Array.from({ length: 3 }, (_, index) => (
          <article key={index}>
            <span className="skeleton-line short" />
            <span className="skeleton-line wide" />
            <span className="skeleton-line wide" />
          </article>
        ))}
      </section>
      <section className="panel source-list">
        {Array.from({ length: 6 }, (_, index) => (
          <article className="source-card skeleton-source-card" key={index}>
            <div>
              <span className="skeleton-line wide" />
              <span className="skeleton-line short" />
            </div>
            <dl>
              {Array.from({ length: 3 }, (_, rowIndex) => (
                <FragmentRow key={rowIndex} />
              ))}
            </dl>
          </article>
        ))}
      </section>
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
        <span className="skeleton-line button" />
      </header>
      <section className="panel skeleton-card">
        <MarketTableSkeleton rows={rows} />
      </section>
    </div>
  );
}

function SkeletonPageHeader({ eyebrowWidth, titleWidth }: { eyebrowWidth: string; titleWidth: string }) {
  return (
    <header className="page-header">
      <div>
        <span className="skeleton-line label" style={{ width: eyebrowWidth }} />
        <span className="skeleton-line title" style={{ width: titleWidth }} />
      </div>
    </header>
  );
}

function FragmentRow() {
  return (
    <>
      <dt><span className="skeleton-line label" /></dt>
      <dd><span className="skeleton-line wide" /></dd>
    </>
  );
}

function MetricSkeleton() {
  return (
    <article className="analytics-card metric-panel skeleton-card">
      <SkeletonTitle />
      <span className="skeleton-line metric" />
      <span className="skeleton-line chip" />
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
