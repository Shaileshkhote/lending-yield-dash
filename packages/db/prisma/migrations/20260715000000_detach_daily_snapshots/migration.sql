-- Daily snapshots are the compact historical source of truth for charts/R2.
-- Keep provenance ids as text, but allow raw/full snapshot tables to be purged.
ALTER TABLE "DailyMarketSnapshot"
  DROP CONSTRAINT IF EXISTS "DailyMarketSnapshot_rawSnapshotId_fkey";

ALTER TABLE "DailyMarketSnapshot"
  DROP CONSTRAINT IF EXISTS "DailyMarketSnapshot_snapshotId_fkey";
