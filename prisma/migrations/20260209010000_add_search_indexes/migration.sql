-- CreateIndex
CREATE INDEX IF NOT EXISTS "Article_feedId_publishedAt_idx" ON "Article"("feedId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Article_title_idx" ON "Article"("title");
