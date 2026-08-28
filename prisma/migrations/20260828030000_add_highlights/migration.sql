-- Highlights & annotations
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT,
    "color" TEXT,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Highlight_userId_idx" ON "Highlight"("userId");
CREATE INDEX "Highlight_articleId_idx" ON "Highlight"("articleId");
CREATE INDEX "Highlight_userId_articleId_idx" ON "Highlight"("userId", "articleId");

ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
