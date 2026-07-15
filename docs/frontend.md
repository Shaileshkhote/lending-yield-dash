# Frontend

The frontend lives in `apps/web` and uses Next.js.

## Pages

```txt
/lending
/lending/markets
/lending/markets/:marketId
/lending/quality
/lending/sources
```

## API Base URL

The browser uses:

```txt
NEXT_PUBLIC_API_BASE_URL
```

Local development can point to:

```txt
http://localhost:4000
```

Production Netlify can point to the VPS API:

```txt
https://69.48.229.8.sslip.io
```

## Data Sources Used By The UI

Home page:

```txt
GET /api/lending/markets/current
```

Market detail:

```txt
GET /api/lending/markets/current
GET /api/lending/protocols/:protocol/pools/:marketId/chart?range=all
GET /api/lending/protocols/:protocol/pools/:marketId/chart?year=YYYY
```

Methodology/source page:

```txt
GET /api/lending/markets/current
```

Quality page:

```txt
GET /api/lending/markets/current
GET /api/lending/quality
```

## Asset And Chain Icons

The UI uses token/chain icon URLs generated on the frontend. Trust Wallet assets are preferred when possible because they are public and stable for many token contracts.

If an icon is missing:

1. Verify the token contract address and chain.
2. Check whether Trust Wallet has an asset entry.
3. Add a small frontend mapping only when a deterministic source is unavailable.

## Table Fields

The primary market table is designed around:

- asset
- total supplied
- total borrowed
- utilization
- 7d APY
- APY 7d change
- 30d APY
- status

The view dropdown controls which columns are visible.

## Loading States

Skeletons live in `apps/web/src/components/Skeletons.tsx`.

Use skeletons for:

- home page loading
- market list loading
- market detail loading
- methodology/source loading

## Build

```bash
pnpm --filter @lendingscope/web typecheck
pnpm --filter @lendingscope/web build
```
