# API

The API is served by `apps/server`.

Base path:

```txt
/api/lending
```

## Public Endpoints

### Manifest

```txt
GET /api/lending/manifest
```

Returns generated cache metadata, available protocols, chains, and file templates.

### Current Markets

```txt
GET /api/lending/markets/current
```

Returns current market rows filtered to `totalSuppliedUsd > 10000`.

Useful fields:

- `marketId`
- `protocol`
- `protocolSlug`
- `chain`
- `assetSymbol`
- `sevenDayApy`
- `apySevenDayChange`
- `thirtyDayApy`
- `totalSuppliedUsd`
- `totalBorrowedUsd`
- `utilization`
- `isActive`
- `isPaused`
- `dataQualityScore`
- `lastUpdated`

### Protocol Current

```txt
GET /api/lending/protocols/:protocol
```

Example:

```txt
GET /api/lending/protocols/aave-v3
```

### Protocol Timeseries

```txt
GET /api/lending/protocols/:protocol/timeseries?range=30d
GET /api/lending/protocols/:protocol/timeseries?range=all
GET /api/lending/protocols/:protocol/timeseries?year=2026
```

Range values:

```txt
7d
30d
90d
365d
all
```

### Pool Timeseries And Chart

```txt
GET /api/lending/protocols/:protocol/pools/:marketId/timeseries?range=30d
GET /api/lending/protocols/:protocol/pools/:marketId/chart?range=30d
GET /api/lending/protocols/:protocol/pools/:marketId/chart?year=2026
```

The chart endpoint returns a DefiLlama-yield-style chart shape for UI charting.

### Chain And Asset Slices

```txt
GET /api/lending/chains/:chain
GET /api/lending/assets/:asset
```

Examples:

```txt
GET /api/lending/chains/ethereum
GET /api/lending/assets/usdc
```

### Market History

```txt
GET /api/lending/markets/:marketId/history?range=30d
```

Returns daily historical rows for one market.

### Rankings

```txt
GET /api/lending/rankings?asset=USDC&sort=supplyApy
```

Sort fields are resolved by the server against current market rows.

### Quality And Anomalies

```txt
GET /api/lending/quality
GET /api/lending/anomalies
```

Quality returns latest quality checks. Anomalies returns non-pass checks.

### Source

```txt
GET /api/lending/sources/:marketId
```

Returns source/provenance details for a market when available.

## Internal Endpoints

Base path:

```txt
/api/internal
```

All internal endpoints require:

```txt
x-admin-api-key: $ADMIN_API_KEY
```

Endpoints:

```txt
POST /api/internal/ingest-now
POST /api/internal/materialize-now
GET /api/internal/ingestion-runs
GET /api/internal/raw-payload/:id
POST /api/internal/echo
```

## Cache Headers

Current, protocol, chain, asset, and rankings endpoints are cacheable:

```txt
public, max-age=60, stale-while-revalidate=300
```

## Error Notes

- Missing materialized files may return a not-found error until `pnpm materialize` runs.
- Internal endpoints return unauthorized when the admin key is missing or wrong.
- Historical endpoints may return empty arrays for dates before a market existed.
