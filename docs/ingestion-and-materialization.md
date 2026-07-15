# Ingestion And Materialization

LendingScope deliberately separates writes from reads.

```txt
Ingestion:       adapters -> Postgres
Materialization: Postgres -> local JSON/R2
Serving:         API/dashboard -> cache + DB fallback
```

## Daily Crons

The NestJS server runs two independent UTC crons:

```txt
01:05 UTC  ingestion
01:35 UTC  materialization
```

Ingestion cron:

```txt
AdapterRunnerService.runOnce()
```

Materialization cron:

```txt
MaterializerService.materialize()
```

Disable crons:

```txt
DISABLE_SCHEDULER=1
DISABLE_INGESTION_SCHEDULER=1
DISABLE_MATERIALIZER_SCHEDULER=1
```

## Manual Commands

Current ingestion:

```bash
pnpm ingest
```

Full materialization:

```bash
pnpm materialize
```

Current-lite only:

```bash
pnpm materialize:current
```

Clear R2 lending prefix:

```bash
pnpm r2:clear
```

Default clear prefix:

```txt
lending/
```

Override:

```txt
R2_CLEAR_PREFIX=lending/protocols/aave-v3/
```

## Backfill

Daily backfill:

```bash
pnpm backfill:daily -- --days=30
```

Chunked backfill:

```bash
pnpm backfill:chunked -- --from=2025-07-15 --to=2026-07-15 --chunk-days=7
```

Useful filters:

```txt
HISTORY_ADAPTERS=aave-v3,morpho-blue
HISTORY_CHAINS=ethereum,base
HISTORY_ASSETS=usdc,weth
BACKFILL_FORCE=1
```

Concurrency knobs:

```txt
BACKFILL_CHUNK_CONCURRENCY=4
BACKFILL_DATE_CONCURRENCY=2
BACKFILL_WRITE_CONCURRENCY=8
BACKFILL_MARKET_RETRIES=3
BACKFILL_BLOCK_RETRIES=4
BACKFILL_DATE_SLEEP_MS=0
BACKFILL_CHUNK_SLEEP_MS=0
```

Date-to-block resolution uses RPC candidates. Some adapters require block numbers for historical subgraph queries.

## Materialized JSON Design

The cache is split by read pattern:

- global current list
- protocol current list
- per-pool current file
- per-pool 30d chart file
- per-pool yearly chart files
- chain files
- asset files
- quality and anomaly files

This avoids serving one huge protocol file when a user opens a single pool detail page.

## Cache Keys

```txt
lending/manifest.json
lending/current.json
lending/current-lite.json
lending/quality.json
lending/anomalies.json
lending/protocols/{protocol}/manifest.json
lending/protocols/{protocol}/current.json
lending/protocols/{protocol}/pools/{marketId}/current.json
lending/protocols/{protocol}/pools/{marketId}/chart-30d.json
lending/protocols/{protocol}/pools/{marketId}/chart-1d/{year}.json
lending/chains/{chain}.json
lending/assets/{asset}.json
```

## Serving Strategy

The public API serves hot current endpoints with cache headers:

```txt
Cache-Control: public, max-age=60, stale-while-revalidate=300
```

The server also keeps a short in-memory cache for file-backed endpoints.

## Source Of Truth Rule

If Postgres and R2 disagree, Postgres wins. Re-run materialization to regenerate R2.
