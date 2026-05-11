-- CreateIndex
CREATE INDEX IF NOT EXISTS "Article_createdAt_idx" ON "Article"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReadArticle_articleId_idx" ON "ReadArticle"("articleId");
