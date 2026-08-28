-- Rule engine v1: automatic actions on matching new articles
ALTER TABLE "NotificationRule" ADD COLUMN "actions" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "NotificationRule" ADD COLUMN "tagName" TEXT;
