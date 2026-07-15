# Concepts

## Lending Market

A lending market is one borrow/supply venue for one asset on one protocol and chain. A market can be a pooled reserve, an isolated pool, or another protocol-specific shape. LendingScope normalizes these into one `Market` and one stream of daily `DailyMarketSnapshot` rows.

## Adapter

An adapter is the protocol-owned collection module. It knows where the protocol data lives, how to query it, and how to normalize the response. The server does not hardcode protocol pools.

Adapters can use different source types:

- Protocol GraphQL APIs
- The Graph subgraphs
- RPC calls
- Event logs
- Dune or other warehouse datasets

The source should be explicit per adapter. Do not hide silent fallbacks inside an adapter because it makes provenance and debugging messy.

## Raw Payload

The raw payload is the source response stored with:

- adapter id
- protocol
- chain
- market id
- block number
- source method
- payload hash
- JSON payload

This makes a snapshot replayable and auditable.

## Canonical Snapshot

A canonical snapshot is the normalized market state used by the API and UI. It includes APYs, supplied/borrowed liquidity, utilization, market status, risk parameters where available, and source metadata.

## Daily Snapshot

Daily snapshots are the compact historical source of truth. Backfills and crons upsert one latest snapshot per market per UTC date.

The dashboard charts are daily because lending analytics does not need hourly granularity for this prototype, and daily storage keeps Postgres and R2 small enough to operate cheaply.

## Materialization

Materialization converts Postgres rows into JSON files optimized for the dashboard. Postgres remains authoritative; R2/local JSON is a cache.

## Quality Status

Quality checks help users decide whether a market row is usable:

- `healthy`: recent usable market data
- `syncing`: data collection or materialization is still catching up
- `stale`: latest data is older than the trust window
- `paused`: protocol says market is paused
- `inactive`: protocol says market is inactive
- `collateral-only`: market can be supplied/collateralized but not borrowed

The exact UI label can be derived from canonical snapshot flags and latest timestamp.
