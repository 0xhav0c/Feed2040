import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/redis";
import { verifyCronAuth } from "@/lib/cron-auth";
import { refreshFeed, runWithConcurrency } from "@/lib/rss/refresh";
import { runPostRefreshAlerts } from "@/lib/rss/alerts";

// The worker gives up waiting after a few minutes and schedules the next run
// while a slow one (full-text scraping) may still be going; overlapping runs
// would alert twice on the same new articles.
let refreshRunning = false;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (refreshRunning) {
    return NextResponse.json({ error: "A refresh is already running" }, { status: 409 });
  }
  refreshRunning = true;

  try {
    const feeds = await prisma.feed.findMany({
      where: { isSystem: false },
      select: {
        id: true,
        url: true,
        title: true,
        siteUrl: true,
        description: true,
        imageUrl: true,
        language: true,
        faviconUrl: true,
        scrapeFullText: true,
        refreshInterval: true,
        lastFetched: true,
        errorCount: true,
        updatedAt: true,
        userId: true,
      },
      orderBy: [
        { lastFetched: { sort: "asc", nulls: "first" } },
        { updatedAt: "asc" },
      ],
    });

    let newArticles = 0;
    let updated = 0;
    let failed = 0;
    const refreshStartedAt = new Date();
    const now = Date.now();
    const feedsToRefresh = feeds.filter((feed) => {
      // Regular per-feed cadence
      if (feed.refreshInterval && feed.lastFetched) {
        const nextRefresh = feed.lastFetched.getTime() + feed.refreshInterval * 60_000;
        if (now < nextRefresh) return false;
      }
      // Exponential backoff for repeatedly failing feeds (never permanently excluded).
      // A transient outage no longer kills feeds forever: they keep retrying, just
      // less often (capped at once every 12h), and errorCount resets to 0 on success.
      // Uses updatedAt (bumped on every attempt, success or fail) as the last-attempt
      // marker, since lastFetched only advances on success.
      if (feed.errorCount > 0) {
        const backoffMs = Math.min(30 * 2 ** (feed.errorCount - 1), 720) * 60_000;
        if (now < feed.updatedAt.getTime() + backoffMs) return false;
      }
      return true;
    });

    await runWithConcurrency(feedsToRefresh, 5, async (feed) => {
      try {
        const result = await refreshFeed(feed);
        newArticles += result.newArticles;
        updated++;
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const shortTitle = feed.title?.slice(0, 30) || feed.url.slice(0, 40);
        console.error(`[Cron] Feed failed: "${shortTitle}" — ${errorMsg}`);
        // The feed may have been deleted mid-refresh; a failed bookkeeping
        // write must not abort the rest of the batch.
        await prisma.feed
          .update({
            where: { id: feed.id },
            data: {
              fetchError: errorMsg,
              errorCount: { increment: 1 },
            },
          })
          .catch(() => {});
      }
    });

    if (updated > 0) await cacheDel("sidebar:*");

    console.log(
      `[Cron] Refreshed ${updated}/${feedsToRefresh.length} feeds, ${newArticles} new articles, ${failed} failed`
    );

    if (newArticles > 0) {
      await runPostRefreshAlerts(feedsToRefresh.map((f) => f.id), refreshStartedAt);
    }

    return NextResponse.json({
      data: { totalFeeds: feeds.length, updated, failed, newArticles },
    });
  } catch (error) {
    console.error("Cron refresh error:", error);
    return NextResponse.json(
      { error: "Failed to refresh feeds" },
      { status: 500 }
    );
  } finally {
    refreshRunning = false;
  }
}
