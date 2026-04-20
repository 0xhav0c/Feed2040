const WEAK_SECRETS = new Set([
  "please-change-this-secret-in-production",
  "feed2040-cron-secret",
  "changeme",
  "secret",
]);

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret || secret.length < 16 || WEAK_SECRETS.has(secret)) {
      console.warn(
        "\n⚠️  WARNING: NEXTAUTH_SECRET is weak or missing. " +
          "Generate a strong secret with: openssl rand -base64 32\n"
      );
    }

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || cronSecret.length < 16 || WEAK_SECRETS.has(cronSecret)) {
      console.warn(
        "\n⚠️  WARNING: CRON_SECRET is weak or missing. " +
          "Generate a strong secret with: openssl rand -hex 24\n"
      );
    }

    if (!process.env.ENCRYPTION_SALT) {
      console.warn(
        "\n⚠️  WARNING: ENCRYPTION_SALT is not set. Using default salt. " +
          "Set a custom value for better security: openssl rand -hex 16\n"
      );
    }
  }
}
