-- CreateEnum
CREATE TYPE "SearchLogStatus" AS ENUM ('RECEIVED', 'NO_MATCH', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortDesc" TEXT NOT NULL,
    "longDesc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "shipmentType" TEXT NOT NULL DEFAULT 'P2P',
    "tatMinutes" INTEGER,
    "basePrice" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceableArea" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "areaCode" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ServiceableArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchLog" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "requestContext" JSONB NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "status" "SearchLogStatus" NOT NULL DEFAULT 'RECEIVED',
    "responsePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceableArea_areaCode_categoryId_idx" ON "ServiceableArea"("areaCode", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceableArea_providerId_areaCode_categoryId_key" ON "ServiceableArea"("providerId", "areaCode", "categoryId");

-- CreateIndex
CREATE INDEX "SearchLog_transactionId_messageId_idx" ON "SearchLog"("transactionId", "messageId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceableArea" ADD CONSTRAINT "ServiceableArea_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceableArea" ADD CONSTRAINT "ServiceableArea_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
