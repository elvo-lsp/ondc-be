-- Replace the plain lookup index with a unique constraint: a retried /search for the
-- same (transactionId, messageId) must not be reprocessed. See docs/ondc/search.md.
DROP INDEX "SearchLog_transactionId_messageId_idx";

CREATE UNIQUE INDEX "SearchLog_transactionId_messageId_key" ON "SearchLog"("transactionId", "messageId");
