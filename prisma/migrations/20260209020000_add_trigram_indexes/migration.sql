-- Enable pg_trgm extension for fast ILIKE searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for full-text ILIKE search on Article
CREATE INDEX IF NOT EXISTS "Article_title_trgm_idx" ON "Article" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Article_content_trgm_idx" ON "Article" USING GIN ("content" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Article_summary_trgm_idx" ON "Article" USING GIN ("summary" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Article_author_trgm_idx" ON "Article" USING GIN ("author" gin_trgm_ops);

-- GIN trigram index on Feed title for search
CREATE INDEX IF NOT EXISTS "Feed_title_trgm_idx" ON "Feed" USING GIN ("title" gin_trgm_ops);
