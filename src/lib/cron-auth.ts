import { NextRequest } from "next/server";

const WEAK_SECRETS = new Set([
  "please-change-this-secret-in-production",
  "feed2040-cron-secret",
  "feedpulse-cron-secret",
  "changeme",
  "secret",
]);

export function getCronSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET environment variable is required");
  }
  if (WEAK_SECRETS.has(secret) || secret.length < 16) {
    throw new Error(
      "CRON_SECRET is too weak. Generate a strong secret with: openssl rand -hex 24"
    );
  }
  return secret;
}

export function verifyCronAuth(req: NextRequest): boolean {
  try {
    const secret = getCronSecret();
    const authHeader = req.headers.get("authorization");
    if (authHeader === `Bearer ${secret}`) return true;
    const webhookSecret = req.headers.get("x-webhook-secret");
    if (webhookSecret === secret) return true;
    return false;
  } catch {
    return false;
  }
}
