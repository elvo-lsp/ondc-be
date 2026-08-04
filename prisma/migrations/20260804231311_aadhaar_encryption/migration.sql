-- AlterTable
ALTER TABLE "RiderProfile" DROP COLUMN "aadharNumber",
ADD COLUMN     "aadhaarCiphertext" BYTEA,
ADD COLUMN     "aadhaarHash" TEXT,
ADD COLUMN     "aadhaarLast4" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RiderProfile_aadhaarHash_key" ON "RiderProfile"("aadhaarHash");

