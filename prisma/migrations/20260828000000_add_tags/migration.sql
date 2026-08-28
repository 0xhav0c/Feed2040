-- User-defined article tags (many-to-many)
CREATE TABLE "Tag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");
CREATE INDEX "Tag_userId_idx" ON "Tag"("userId");

ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ArticleTag" (
  "articleId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleTag_pkey" PRIMARY KEY ("articleId", "tagId")
);

CREATE INDEX "ArticleTag_tagId_idx" ON "ArticleTag"("tagId");
CREATE INDEX "ArticleTag_articleId_idx" ON "ArticleTag"("articleId");

ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
