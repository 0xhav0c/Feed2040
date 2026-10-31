-- Semantic search was removed: drop the article embeddings and the
-- per-user embedding model. The pgvector extension itself is left in place.
DROP INDEX IF EXISTS "Article_embedding_idx";
ALTER TABLE "Article" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "AISettings" DROP COLUMN IF EXISTS "embeddingModel";
