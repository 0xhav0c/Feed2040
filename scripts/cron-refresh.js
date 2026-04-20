/**
 * Feed refresh cron worker
 * Reads interval from the AppSettings API, defaults to 15 minutes.
 * Calls /api/cron/refresh to fetch new articles.
 */
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret || cronSecret.length < 16) {
  console.error("[Cron] CRON_SECRET is missing or too weak. Generate with: openssl rand -hex 24");
  process.exit(1);
}
const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
let currentInterval = parseInt(process.env.REFRESH_INTERVAL_MINUTES || "15", 10);

console.log(`[Cron] Feed refresh scheduler started (initial: every ${currentInterval} minutes)`);

async function getIntervalFromApi() {
  try {
    const res = await fetch(`${baseUrl}/api/settings/refresh`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    if (res.ok) {
      const data = await res.json();
      return data.data?.intervalMinutes || currentInterval;
    }
  } catch {
    // API not ready yet or error - use current
  }
  return currentInterval;
}

async function refreshFeeds() {
  try {
    const res = await fetch(`${baseUrl}/api/cron/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const data = await res.json();
    if (res.ok) {
      console.log(
        `[Cron] Refresh complete: ${data.data.newArticles} new articles, ${data.data.updated}/${data.data.totalFeeds} feeds`
      );
    } else {
      console.error("[Cron] Refresh failed:", data.error);
    }
  } catch (err) {
    console.error("[Cron] Refresh error:", err.message);
  }
}

async function runCycle() {
  await refreshFeeds();

  // Check if interval changed
  const newInterval = await getIntervalFromApi();
  if (newInterval !== currentInterval) {
    console.log(`[Cron] Interval changed: ${currentInterval}m -> ${newInterval}m`);
    currentInterval = newInterval;
  }

  // Schedule next run
  setTimeout(runCycle, currentInterval * 60 * 1000);
}

// ── Digest scheduler (runs every minute) ──
async function checkDigest() {
  try {
    const res = await fetch(`${baseUrl}/api/cron/digest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const data = await res.json();
    if (res.ok && data.data?.sent > 0) {
      console.log(`[Cron] Digest sent to ${data.data.sent} user(s)`);
    }
  } catch {
    // silent — app might not be ready or no users configured
  }
}

// ── Scheduled web briefing (runs every minute) ──
async function checkWebBriefing() {
  try {
    const res = await fetch(`${baseUrl}/api/cron/web-digest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const data = await res.json();
    if (res.ok && data.data?.generated > 0) {
      console.log(`[Cron] Web briefing generated for ${data.data.generated} user(s)`);
    }
    if (!res.ok) {
      console.error(`[Cron] Web briefing error: ${res.status}`, data);
    }
  } catch (err) {
    console.error("[Cron] Web briefing fetch error:", err.message);
  }
}

// Wait 30s for app to be ready, then start first cycle
setTimeout(runCycle, 30000);
// Check digest schedule every 60 seconds
setInterval(checkDigest, 60000);
// Check web briefing schedule every 60 seconds
setInterval(checkWebBriefing, 60000);
