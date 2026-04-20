-- Add custom base URL fields for OpenAI and Anthropic
ALTER TABLE "UserApiKeys" ADD COLUMN "openaiBaseUrl" TEXT;
ALTER TABLE "UserApiKeys" ADD COLUMN "anthropicBaseUrl" TEXT;
