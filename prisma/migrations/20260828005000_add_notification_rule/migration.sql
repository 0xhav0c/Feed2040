-- Create NotificationRule table (was missing from history; add_rule_actions assumed it existed).
-- Idempotent: existing installs already have this table, fresh installs need it created here.
-- The "actions" and "tagName" columns are added by the following 20260828010000_add_rule_actions migration.
CREATE TABLE IF NOT EXISTS "NotificationRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keywords" TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notifyTelegram" BOOLEAN NOT NULL DEFAULT true,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationRule_userId_idx" ON "NotificationRule"("userId");

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS, so guard the FK for existing installs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "pg_constraint" WHERE "conname" = 'NotificationRule_userId_fkey'
  ) THEN
    ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
