-- CreateTable
CREATE TABLE "DailyMarketSnapshot" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "marketType" TEXT NOT NULL,
    "assetSymbol" TEXT NOT NULL,
    "assetAddress" TEXT NOT NULL,
    "supplyApy" DOUBLE PRECISION,
    "borrowApy" DOUBLE PRECISION,
    "rewardSupplyApy" DOUBLE PRECISION,
    "rewardBorrowApy" DOUBLE PRECISION,
    "netSupplyApy" DOUBLE PRECISION,
    "totalSuppliedUsd" DOUBLE PRECISION,
    "totalBorrowedUsd" DOUBLE PRECISION,
    "availableLiquidityUsd" DOUBLE PRECISION,
    "utilization" DOUBLE PRECISION,
    "ltv" DOUBLE PRECISION,
    "liquidationThreshold" DOUBLE PRECISION,
    "reserveFactor" DOUBLE PRECISION,
    "supplyCapUsd" DOUBLE PRECISION,
    "borrowCapUsd" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL,
    "isPaused" BOOLEAN NOT NULL,
    "dataQualityScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "sourcePayloadHash" TEXT NOT NULL,
    "sourceMethod" TEXT NOT NULL,
    "sourceContracts" JSONB NOT NULL,
    "rawSnapshotId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyMarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyMarketSnapshot_marketId_date_key" ON "DailyMarketSnapshot"("marketId", "date");

-- CreateIndex
CREATE INDEX "DailyMarketSnapshot_adapterId_date_idx" ON "DailyMarketSnapshot"("adapterId", "date");

-- CreateIndex
CREATE INDEX "DailyMarketSnapshot_chain_date_idx" ON "DailyMarketSnapshot"("chain", "date");

-- CreateIndex
CREATE INDEX "DailyMarketSnapshot_assetSymbol_date_idx" ON "DailyMarketSnapshot"("assetSymbol", "date");

-- CreateIndex
CREATE INDEX "DailyMarketSnapshot_date_idx" ON "DailyMarketSnapshot"("date");

-- CreateIndex
CREATE INDEX "DailyMarketSnapshot_snapshotId_idx" ON "DailyMarketSnapshot"("snapshotId");

-- AddForeignKey
ALTER TABLE "DailyMarketSnapshot" ADD CONSTRAINT "DailyMarketSnapshot_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMarketSnapshot" ADD CONSTRAINT "DailyMarketSnapshot_rawSnapshotId_fkey" FOREIGN KEY ("rawSnapshotId") REFERENCES "RawMarketSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMarketSnapshot" ADD CONSTRAINT "DailyMarketSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MarketSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
