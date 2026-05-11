import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/redis";
import { refreshFeed } from "@/lib/rss/refresh";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(): Promise<Response> {
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

  const userId = session.user.id;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const feeds = await prisma.feed.findMany({
          where: { userId },
          select: {
            id: true, url: true, title: true, siteUrl: true,
            description: true, imageUrl: true, language: true,
            faviconUrl: true, scrapeFullText: true, errorCount: true,
          },
          orderBy: [
            { lastFetched: { sort: "asc", nulls: "first" } },
            { updatedAt: "asc" },
          ],
        });

        let updated = 0;
        let failed = 0;
        let newArticles = 0;
        const total = feeds.length;

        send({ type: "start", total });

        for (let i = 0; i < feeds.length; i++) {
          const feed = feeds[i];

          if (feed.errorCount >= 5) {
            send({ type: "progress", current: i + 1, total, feed: feed.title || feed.url, status: "skipped", newArticles, updated, failed });
            continue;
          }

          try {
            const result = await refreshFeed(feed);
            newArticles += result.newArticles;
            updated++;
            send({ type: "progress", current: i + 1, total, feed: feed.title || feed.url, status: "ok", feedNewArticles: result.newArticles, newArticles, updated, failed });
          } catch (err) {
            failed++;
            const errorMsg = err instanceof Error ? err.message : "Unknown error";
            await prisma.feed.update({
              where: { id: feed.id },
              data: { fetchError: errorMsg, errorCount: { increment: 1 } },
            });
            send({ type: "progress", current: i + 1, total, feed: feed.title || feed.url, status: "error", error: errorMsg, newArticles, updated, failed });
          }
        }

        if (updated > 0) await cacheDel("sidebar:*");
        send({ type: "complete", totalFeeds: total, updated, failed, newArticles });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
