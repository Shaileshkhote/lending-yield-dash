# Adapters

Adapters live in `packages/adapters/src/adapters/{protocol}/index.ts`.

Current adapters:

- `aave-v3`
- `aave-v4`
- `spark`
- `compound-v3`
- `morpho-blue`

## Adapter Contract

```ts
export interface LendingAdapter {
  id: string;
  protocol: string;
  version: AdapterVersion;
  adapter: Record<string, LendingChainConfig>;
  supportedChains: string[];
  dataAvailability: AdapterDataAvailability;
  fetch(options: LendingFetchOptions): Promise<LendingFetchResult>;
  backfillEvents?(): Promise<RawMarketEvent[]>;
  normalizeEvent?(): Promise<CanonicalMarketEvent>;
}
```

`fetch()` returns:

- discovered markets
- raw payloads
- canonical snapshots
- adapter-level errors

## Folder Rules

Keep protocol-specific logic in the protocol adapter folder:

```txt
packages/adapters/src/adapters/aave/index.ts
packages/adapters/src/adapters/aave-v4/index.ts
packages/adapters/src/adapters/compound/index.ts
packages/adapters/src/adapters/morpho-blue/index.ts
packages/adapters/src/adapters/spark/index.ts
```

Use `packages/adapters/src/helpers` only for helpers used by multiple adapters, such as:

- chain names
- RPC block resolution
- GraphQL requests
- adapter version metadata
- shared protocol snapshot shaping

Do not move Aave-only, Spark-only, Compound-only, or Morpho-only query logic into generic helpers.

## Data Availability

Each adapter declares whether it supports current and/or historical daily data:

```ts
dataAvailability: {
  current: true,
  history: {
    granularity: "1d",
    startDateByChain: {
      ethereum: "2024-01-01"
    }
  }
}
```

Backfill commands use this to skip dates before the adapter has data.

## Source Methods

Every raw payload must carry a source method. Examples:

```txt
subgraph
protocol-graphql
dune
rpc
event-logs
```

The source method is stored in both raw payloads and canonical snapshots so the methodology page can show provenance.

## Adding A New Adapter

1. Create `packages/adapters/src/adapters/{slug}/index.ts`.
2. Implement the `LendingAdapter` contract.
3. Add source config and start dates inside that adapter.
4. Return raw payloads and canonical snapshots from `fetch()`.
5. Export the adapter from `packages/adapters/src/registry.ts`.
6. Add focused unit tests for normalization.
7. Run:

```bash
pnpm --filter @lendingscope/adapters test:unit
pnpm test {adapter-slug} latest
```

## Adapter Principles

- Prefer real protocol-owned or public source data.
- Keep adapters self-contained.
- Store raw payloads before normalization.
- Avoid hardcoded market data.
- Avoid competitor-normalized datasets.
- Do not silently fall back between unrelated source methods.
- Use daily historical data unless the product explicitly needs higher granularity.
