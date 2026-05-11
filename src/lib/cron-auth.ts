import { NextRequest } from "next/server";
import crypto from "crypto";

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

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function verifyCronAuth(req: NextRequest): boolean {
  try {
    const secret = getCronSecret();
    const expected = `Bearer ${secret}`;
    const authHeader = req.headers.get("authorization");
    if (authHeader && timingSafeCompare(authHeader, expected)) return true;
    const webhookSecret = req.headers.get("x-webhook-secret");
    if (webhookSecret && timingSafeCompare(webhookSecret, secret)) return true;
    return false;
  } catch {
    return false;
  }
}
