-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "code" TEXT;

-- CreateTable
CREATE TABLE "VendorContact" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorContact_vendorId_idx" ON "VendorContact"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_partnerId_code_key" ON "Vendor"("partnerId", "code");

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
