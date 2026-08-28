-- Semantic search: pgvector extension + article embeddings
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- HNSW cosine index (skips NULL embeddings; fills in as rows are backfilled)
CREATE INDEX IF NOT EXISTS "Article_embedding_idx" ON "Article" USING hnsw ("embedding" vector_cosine_ops);

-- Per-user embedding model (OpenAI-compatible)
ALTER TABLE "AISettings" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-3-small';
