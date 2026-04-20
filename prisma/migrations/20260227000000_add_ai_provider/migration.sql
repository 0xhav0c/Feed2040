-- Add provider and digestModel columns to AISettings
ALTER TABLE "AISettings" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE "AISettings" ADD COLUMN IF NOT EXISTS "digestModel" TEXT NOT NULL DEFAULT 'gpt-4o';
