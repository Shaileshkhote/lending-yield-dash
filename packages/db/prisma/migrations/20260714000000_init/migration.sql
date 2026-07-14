-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawMarketSnapshot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "sourceMethod" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawMarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "marketType" TEXT NOT NULL,
    "assetSymbol" TEXT NOT NULL,
    "assetAddress" TEXT NOT NULL,
    "sourceMethod" TEXT NOT NULL,
    "contracts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityCheck" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT,
    "marketId" TEXT NOT NULL,
    "checkName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "observedValue" TEXT,
    "expectedValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterializationRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "MaterializationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "R2Object" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "etag" TEXT,
    "contentHash" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materializationRunId" TEXT NOT NULL,
    "publicUrl" TEXT,

    CONSTRAINT "R2Object_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RawMarketSnapshot_payloadHash_idx" ON "RawMarketSnapshot"("payloadHash");

-- CreateIndex
CREATE INDEX "RawMarketSnapshot_marketId_createdAt_idx" ON "RawMarketSnapshot"("marketId", "createdAt");

-- CreateIndex
CREATE INDEX "Market_protocol_chain_assetSymbol_idx" ON "Market"("protocol", "chain", "assetSymbol");

-- CreateIndex
CREATE INDEX "MarketSnapshot_marketId_timestamp_idx" ON "MarketSnapshot"("marketId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "MarketSnapshot_protocol_chain_assetSymbol_idx" ON "MarketSnapshot"("protocol", "chain", "assetSymbol");

-- CreateIndex
CREATE INDEX "MarketSnapshot_timestamp_idx" ON "MarketSnapshot"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "QualityCheck_marketId_status_createdAt_idx" ON "QualityCheck"("marketId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "R2Object_key_generatedAt_idx" ON "R2Object"("key", "generatedAt" DESC);

-- AddForeignKey
ALTER TABLE "RawMarketSnapshot" ADD CONSTRAINT "RawMarketSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IngestionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IngestionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_rawSnapshotId_fkey" FOREIGN KEY ("rawSnapshotId") REFERENCES "RawMarketSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MarketSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "R2Object" ADD CONSTRAINT "R2Object_materializationRunId_fkey" FOREIGN KEY ("materializationRunId") REFERENCES "MaterializationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
