-- AlterTable
ALTER TABLE "RiderDocument" ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "supersededById" TEXT;

-- CreateIndex
CREATE INDEX "RiderDocument_supersededById_idx" ON "RiderDocument"("supersededById");

-- CreateIndex
CREATE INDEX "RiderDocument_riderId_type_supersededAt_idx" ON "RiderDocument"("riderId", "type", "supersededAt");

-- AddForeignKey
ALTER TABLE "RiderDocument" ADD CONSTRAINT "RiderDocument_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "RiderDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Emails are now stored lowercased so lookups can be exact rather than
-- case-insensitive (which Prisma compiles to ILIKE, making '%' and '_' wildcards).
--
-- "email" is UNIQUE and case-sensitive, so if two rows differ only by case this
-- fails and the migration aborts - intentionally: that is two riders claiming one
-- address, and which survives is a decision for a person.
UPDATE "Rider" SET "email" = LOWER("email") WHERE "email" <> LOWER("email");
