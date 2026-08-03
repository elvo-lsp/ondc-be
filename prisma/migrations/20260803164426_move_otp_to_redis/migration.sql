/*
  Warnings:

  - You are about to drop the `RiderOtp` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "RiderOtp" DROP CONSTRAINT "RiderOtp_riderId_fkey";

-- DropTable
DROP TABLE "RiderOtp";
