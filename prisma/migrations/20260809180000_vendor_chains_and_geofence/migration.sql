-- CreateTable
CREATE TABLE "VendorChain" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorChain_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "chainId" TEXT,
ADD COLUMN     "geofenceRadiusMeters" INTEGER,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "needsRiders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "needsVehicles" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "VendorChain_partnerId_idx" ON "VendorChain"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorChain_partnerId_name_key" ON "VendorChain"("partnerId", "name");

-- CreateIndex
CREATE INDEX "Vendor_chainId_idx" ON "Vendor"("chainId");

-- AddForeignKey
ALTER TABLE "VendorChain" ADD CONSTRAINT "VendorChain_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorChain" ADD CONSTRAINT "VendorChain_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "VendorChain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
