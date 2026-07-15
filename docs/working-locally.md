# Working Locally

This guide starts a local Postgres database, runs the backend and frontend, ingests data, and builds the JSON cache.

## 1. Install Dependencies

```bash
pnpm install
```

## 2. Create Environment File

```bash
cp .env.example .env
```

Minimum useful values:

```txt
DATABASE_URL="postgresql://lendingscope:lendingscope@localhost:5432/lendingscope?schema=public"
ADMIN_API_KEY="dev-admin-key"
PORT="4000"
NEXT_PUBLIC_API_BASE_URL="http://localhost:4000"
THE_GRAPH_API_KEY="..."
THE_GRAPH_GATEWAY_URL="https://gateway.thegraph.com/api"
```

Leave R2 values empty for local-only JSON cache.

## 3. Start Postgres

```bash
docker compose up -d postgres
```

## 4. Run Migrations

```bash
pnpm db:migrate
pnpm db:generate
```

If you point at an existing non-empty database, use the existing migration baseline flow before deploying migrations.

## 5. Start The Apps

```bash
pnpm dev
```

Open:

```txt
http://localhost:3000/lending
```

API:

```txt
http://localhost:4000
```

## 6. Ingest Data

Run all current adapters once:

```bash
pnpm ingest
```

Run one adapter through the history CLI:

```bash
pnpm test aave latest
pnpm test morpho latest
```

Backfill recent daily data:

```bash
pnpm backfill:daily -- --days=30
```

Backfill with chunks:

```bash
pnpm backfill:chunked -- --from=2026-06-15 --to=2026-07-15 --chunk-days=7
```

## 7. Materialize Cache

Build the full cache:

```bash
pnpm materialize
```

Build only the hot current list:

```bash
pnpm materialize:current
```

Local files appear under:

```txt
apps/server/public/data/lending/
```

## 8. Check The API

```bash
curl -sS http://localhost:4000/api/lending/markets/current | head
```

Expected behavior:

- HTTP 200
- `status: "success"`
- `data` array with current markets after ingestion/materialization

## 9. Validate Before Push

```bash
pnpm typecheck
pnpm test
pnpm --filter @lendingscope/web build
```

## Common Issues

Missing The Graph key:

```txt
Adapter requests fail or return authorization errors.
```

Fix: set `THE_GRAPH_API_KEY`.

No materialized file:

```txt
Cache file ... has not been materialized yet
```

Fix: run `pnpm materialize` or `pnpm materialize:current`.

Public RPC rate limit during backfill:

```txt
Too many request
```

Fix: lower backfill concurrency or set paid/private RPC URLs.

Prisma client missing after install:

```bash
pnpm db:generate
```
