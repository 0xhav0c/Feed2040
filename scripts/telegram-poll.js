/**
 * Telegram bot long-polling worker.
 * Polls Telegram API for updates and forwards them to the internal webhook handler.
 * No HTTPS or public URL required — works out of the box for self-hosted setups.
 */
const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret || cronSecret.length < 16) {
  console.error("[Telegram] CRON_SECRET is missing or too weak. Generate with: openssl rand -hex 24");
  process.exit(1);
}
const TELEGRAM_API = "https://api.telegram.org/bot";
const STARTUP_DELAY_MS = 20000;
const RETRY_DELAY_MS = 30000;

let running = true;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBotToken() {
  try {
    const res = await fetch(`${baseUrl}/api/internal/telegram-token`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token || null;
  } catch {
    return null;
  }
}

async function forwardToWebhook(update) {
  try {
    await fetch(`${baseUrl}/api/telegram/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": cronSecret,
      },
      body: JSON.stringify(update),
    });
  } catch (err) {
    console.error("[Telegram] Webhook forward error:", err.message);
  }
}

async function pollLoop(token) {
  // Clear any existing webhook so polling works
  try {
    await fetch(`${TELEGRAM_API}${token}/deleteWebhook`);
  } catch {
    // ignore
  }

  let offset = 0;
  console.log("[Telegram] Polling started");

  while (running) {
    try {
      const url = `${TELEGRAM_API}${token}/getUpdates?offset=${offset}&timeout=25&allowed_updates=["message"]`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          console.error("[Telegram] Invalid bot token, stopping poller");
          return;
        }
        await sleep(5000);
        continue;
      }

      const data = await res.json();
      if (data.ok && data.result?.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          await forwardToWebhook(update);
        }
      }
    } catch (err) {
      if (err.name === "AbortError") continue;
      console.error("[Telegram] Poll error:", err.message);
      await sleep(5000);
    }
  }
}

async function main() {
  console.log("[Telegram] Bot poller starting, waiting for app...");
  await sleep(STARTUP_DELAY_MS);

  while (running) {
    const token = await fetchBotToken();

    if (!token) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    await pollLoop(token);
    // If pollLoop exits (invalid token etc.), retry after delay
    await sleep(RETRY_DELAY_MS);
  }
}

main().catch((err) => {
  console.error("[Telegram] Fatal error:", err);
  process.exit(1);
});
