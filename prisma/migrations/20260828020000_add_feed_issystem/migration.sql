-- Read-it-later: mark the per-user "Saved Articles" bucket feed
ALTER TABLE "Feed" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
