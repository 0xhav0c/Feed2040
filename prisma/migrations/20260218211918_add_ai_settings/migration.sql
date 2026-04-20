-- DropIndex
DROP INDEX "Article_author_trgm_idx";

-- DropIndex
DROP INDEX "Article_content_trgm_idx";

-- DropIndex
DROP INDEX "Article_feedId_publishedAt_idx";

-- DropIndex
DROP INDEX "Article_summary_trgm_idx";

-- DropIndex
DROP INDEX "Article_title_trgm_idx";

-- DropIndex
DROP INDEX "Feed_title_trgm_idx";

-- CreateTable
CREATE TABLE "AISettings" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "autoSummarize" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'tr',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AISettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AISettings_userId_key" ON "AISettings"("userId");

-- CreateIndex
CREATE INDEX "Article_feedId_publishedAt_idx" ON "Article"("feedId", "publishedAt");

-- AddForeignKey
ALTER TABLE "AISettings" ADD CONSTRAINT "AISettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
