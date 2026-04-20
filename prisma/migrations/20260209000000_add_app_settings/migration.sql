-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_key_key" ON "AppSettings"("key");

-- Seed default refresh interval
INSERT INTO "AppSettings" ("id", "key", "value", "updatedAt")
VALUES ('default-refresh-interval', 'refreshIntervalMinutes', '15', NOW())
ON CONFLICT ("key") DO NOTHING;
