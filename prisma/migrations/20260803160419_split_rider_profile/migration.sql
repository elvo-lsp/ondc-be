/*
  Warnings:

  - You are about to drop the column `aadharNumber` on the `Rider` table. All the data in the column will be lost.
  - You are about to drop the column `dateOfBirth` on the `Rider` table. All the data in the column will be lost.
  - You are about to drop the column `documentsCompletedAt` on the `Rider` table. All the data in the column will be lost.
  - You are about to drop the column `permanentAddress` on the `Rider` table. All the data in the column will be lost.
  - You are about to drop the column `profileCompletedAt` on the `Rider` table. All the data in the column will be lost.
  - You are about to drop the column `temporaryAddress` on the `Rider` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Rider" DROP COLUMN "aadharNumber",
DROP COLUMN "dateOfBirth",
DROP COLUMN "documentsCompletedAt",
DROP COLUMN "permanentAddress",
DROP COLUMN "profileCompletedAt",
DROP COLUMN "temporaryAddress";

-- CreateTable
CREATE TABLE "RiderProfile" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "temporaryAddress" TEXT,
    "permanentAddress" TEXT,
    "aadharNumber" TEXT,
    "profileCompletedAt" TIMESTAMP(3),
    "documentsCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiderProfile_riderId_key" ON "RiderProfile"("riderId");

-- AddForeignKey
ALTER TABLE "RiderProfile" ADD CONSTRAINT "RiderProfile_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
