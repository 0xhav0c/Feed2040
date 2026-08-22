-- Track the last date a Telegram digest was sent, for cron idempotency
ALTER TABLE "TelegramSettings" ADD COLUMN "lastDigestSentDate" TEXT;
