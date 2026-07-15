# Deployment And Operations

## Current Deployment Shape

Recommended demo deployment:

```txt
Next.js dashboard -> Netlify
NestJS API        -> VPS with PM2
Postgres          -> Neon or local Postgres
JSON cache        -> Cloudflare R2 or local filesystem
```

Cloudflare Workers are not used for the NestJS server because the full Nest runtime is better suited to a normal Node process.

## VPS Process

Current PM2 process name:

```txt
lendingscope-api
```

Start command:

```bash
pm2 start pnpm --name lendingscope-api -- --filter @lendingscope/server start
pm2 save
```

Useful commands:

```bash
pm2 list
pm2 describe lendingscope-api
pm2 logs lendingscope-api --lines 100
pm2 restart lendingscope-api
```

## Pull Latest Code On VPS

```bash
cd /opt/lending-yield-dash
git pull --ff-only origin main
CI=true pnpm install
pnpm db:generate
pnpm --filter @lendingscope/server typecheck
pm2 restart lendingscope-api
```

## Database

Apply migrations:

```bash
pnpm db:deploy
```

Generate Prisma client:

```bash
pnpm db:generate
```

If using Neon free-tier storage, avoid storing unnecessary raw historical data forever. Daily snapshots are the compact historical source of truth.

## Backfill Monitoring

Run backfill with logs:

```bash
cd /opt/lending-yield-dash
HISTORY_ADAPTERS=aave-v3,morpho-blue pnpm backfill:chunked -- --from=2025-07-15 --to=2026-07-15 --chunk-days=7
```

Typical log checkpoints:

```txt
[chunked-backfill] range=...
[chunked-backfill] DATE adapter chain fetching
[chunked-backfill] DATE adapter chain done snapshots=...
```

If a public RPC rate-limits, reduce concurrency or set a better RPC URL.

## R2 Operations

Full materialization:

```bash
pnpm materialize
```

Clear all lending cache objects:

```bash
pnpm r2:clear
```

Clear a smaller prefix:

```bash
R2_CLEAR_PREFIX=lending/protocols/aave-v3/ pnpm r2:clear
```

## Health Checks

API current markets:

```bash
curl -sS -o /tmp/current.json -w "status=%{http_code} time=%{time_total}s size=%{size_download}\n" \
  https://69.48.229.8.sslip.io/api/lending/markets/current
```

Expected:

```txt
status=200
```

## Release Checklist

Before pushing:

```bash
pnpm typecheck
pnpm test
pnpm --filter @lendingscope/web build
```

After deploying server:

```bash
pnpm db:generate
pm2 restart lendingscope-api
curl -sS https://69.48.229.8.sslip.io/api/lending/markets/current >/dev/null
```

After changing data shape:

```bash
pnpm materialize
```
