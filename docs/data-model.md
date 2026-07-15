# Data Model

Postgres is the source of truth. Prisma schema lives at `packages/db/prisma/schema.prisma`.

## Core Tables

### IngestionRun

One adapter runner execution.

Important fields:

- `id`
- `status`
- `startedAt`
- `finishedAt`
- `error`

### RawMarketSnapshot

Raw source payload for one market snapshot.

Important fields:

- `runId`
- `adapterId`
- `protocol`
- `chain`
- `marketId`
- `blockNumber`
- `sourceMethod`
- `payloadHash`
- `payloadJson`

This is the audit layer.

### Market

Market identity and static-ish metadata.

Important fields:

- `id`
- `protocol`
- `chain`
- `adapterId`
- `marketType`
- `assetSymbol`
- `assetAddress`
- `sourceMethod`
- `contracts`

### MarketSnapshot

Full normalized snapshot produced by ingestion.

Important fields:

- APYs: `supplyApy`, `borrowApy`, rewards, net supply APY
- liquidity: `totalSuppliedUsd`, `totalBorrowedUsd`, `availableLiquidityUsd`
- risk: `ltv`, `liquidationThreshold`, `reserveFactor`, caps
- status: `isActive`, `isPaused`
- provenance: `sourcePayloadHash`, `sourceMethod`, `sourceContracts`

### DailyMarketSnapshot

Compact historical table used by charts and materialization.

It stores one row per market per UTC date:

```txt
unique(marketId, date)
```

This table is the main source for:

- current rows
- 7d APY
- 30d APY
- 7d APY change
- charts
- protocol/year files
- R2 cache files

### QualityCheck

Quality result for a market/snapshot.

Important fields:

- `marketId`
- `snapshotId`
- `checkName`
- `status`
- `severity`
- `message`
- observed/expected values

### MaterializationRun

One materializer execution.

### R2Object

One written cache object. It records:

- key
- content hash
- byte size
- etag
- public URL
- materialization run id

## Why DailyMarketSnapshot Is Detached

Historical backfills can produce many daily records. Keeping daily history independent from raw/current snapshots lets the database retain compact chart history without requiring every raw payload row forever.

The migrations detach `DailyMarketSnapshot` from strict raw/snapshot foreign keys so storage can be optimized later without losing chart history.

## Current Market Filter

Current materialized rows filter out inactive dust markets:

```txt
totalSuppliedUsd > 10000
```

This keeps dashboard reads smaller and more useful.

## Provenance

Every normalized row keeps enough source metadata to explain where it came from:

```txt
sourceMethod
sourcePayloadHash
sourceContracts
```

Raw payloads can be fetched through internal admin endpoints for debugging.
