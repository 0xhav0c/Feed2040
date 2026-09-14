-- Add a monotonic, auto-incrementing "seq" to Article so the Fever API can do
-- correct since_id pagination (hashId is random and cannot be ordered).

-- 1. Sequence (Prisma naming convention: <Table>_<column>_seq)
CREATE SEQUENCE IF NOT EXISTS "Article_seq_seq";

-- 2. Add the column as nullable first so we can backfill deterministically
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "seq" INTEGER;

-- 3. Backfill existing rows in chronological order (oldest = smallest seq)
WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "Article"
)
UPDATE "Article" a SET "seq" = o.rn FROM ordered o WHERE a."id" = o."id" AND a."seq" IS NULL;

-- 4. Advance the sequence past the highest backfilled value
SELECT setval('"Article_seq_seq"', COALESCE((SELECT MAX("seq") FROM "Article"), 0) + 1, false);

-- 5. Wire up default, NOT NULL, ownership and the unique index
ALTER TABLE "Article" ALTER COLUMN "seq" SET DEFAULT nextval('"Article_seq_seq"');
ALTER TABLE "Article" ALTER COLUMN "seq" SET NOT NULL;
ALTER SEQUENCE "Article_seq_seq" OWNED BY "Article"."seq";
CREATE UNIQUE INDEX IF NOT EXISTS "Article_seq_key" ON "Article"("seq");
