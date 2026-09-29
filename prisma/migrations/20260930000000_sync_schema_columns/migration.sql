-- Reconcile columns that exist in schema.prisma but were never added by a migration
-- (they had only been applied to dev DBs via `prisma db push`). Fresh installs were
-- missing them, which broke login (User.feverApiKey), feed refresh and AI briefings.
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op on installs that already have them.

-- User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "feverApiKey" TEXT;

-- Feed
ALTER TABLE "Feed" ADD COLUMN IF NOT EXISTS "scrapeFullText" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Feed" ADD COLUMN IF NOT EXISTS "refreshInterval" INTEGER;

-- Article
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "enclosureUrl" TEXT;
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "enclosureType" TEXT;
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "enclosureDuration" TEXT;

-- AISettings
ALTER TABLE "AISettings" ADD COLUMN IF NOT EXISTS "briefingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AISettings" ADD COLUMN IF NOT EXISTS "briefingTimes" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "AISettings" ADD COLUMN IF NOT EXISTS "briefingTimezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul';
ALTER TABLE "AISettings" ADD COLUMN IF NOT EXISTS "briefingHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "AISettings" ADD COLUMN IF NOT EXISTS "briefingCategories" TEXT[] NOT NULL DEFAULT '{}';
