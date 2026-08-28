import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/redis";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { refreshFeed, runWithConcurrency } from "@/lib/rss/refresh";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`refresh:${session.user.id}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 10) }
    );
  }

  try {
    // Support optional feedId body param to refresh a single feed
    let feedIdFilter: string | undefined;
    try {
      const body = await req.json();
      if (body?.feedId && typeof body.feedId === "string") {
        feedIdFilter = body.feedId;
      }
    } catch {
      // No body or invalid JSON — refresh all feeds
    }

    const feeds = await prisma.feed.findMany({
      where: {
        userId: session.user.id,
        isSystem: false,
        ...(feedIdFilter ? { id: feedIdFilter } : {}),
      },
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
      },
      orderBy: [
        { lastFetched: { sort: "asc", nulls: "first" } },
        { updatedAt: "asc" },
      ],
    });

    let updated = 0;
    let failed = 0;
    let newArticles = 0;

    // Delegate to the shared refreshFeed() so behaviour (URL-based dedup,
    // full-text scraping, accurate insert counts, favicon derivation) matches
    // the cron path exactly. A manual refresh deliberately retries every feed —
    // no permanent errorCount exclusion — so users can recover failing feeds.
    await runWithConcurrency(feeds, 5, async (feed) => {
      try {
        const result = await refreshFeed(feed);
        newArticles += result.newArticles;
        updated++;
      } catch (err) {
        failed++;
        await prisma.feed.update({
          where: { id: feed.id },
          data: {
            fetchError: err instanceof Error ? err.message : "Unknown error",
            errorCount: { increment: 1 },
          },
        });
      }
    });

    if (updated > 0) await cacheDel("sidebar:*");
    return NextResponse.json({
      data: { totalFeeds: feeds.length, updated, failed, newArticles },
    });
  } catch (error) {
    console.error("Failed to refresh feeds:", error);
    return NextResponse.json(
      { error: "Failed to refresh feeds" },
      { status: 500 }
    );
  }
}
