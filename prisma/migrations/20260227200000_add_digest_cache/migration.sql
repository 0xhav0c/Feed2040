-- CreateTable
CREATE TABLE "Digest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hours" INTEGER NOT NULL DEFAULT 24,
    "source" TEXT NOT NULL DEFAULT 'web',
    "structured" JSONB NOT NULL,
    "htmlDigest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Digest_userId_date_hours_source_key" ON "Digest"("userId", "date", "hours", "source");

-- CreateIndex
CREATE INDEX "Digest_userId_date_idx" ON "Digest"("userId", "date");

-- AddForeignKey
ALTER TABLE "Digest" ADD CONSTRAINT "Digest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
