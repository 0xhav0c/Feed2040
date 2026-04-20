import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/redis";
import { parseFeed } from "@/lib/rss/parser";

export async function POST(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
            send({
              type: "progress",
              current: i + 1,
              total,
              feed: feed.title || feed.url,
              status: "skipped",
              newArticles,
              updated,
              failed,
            });
            continue;
          }

          try {
            const parsedFeed = await parseFeed(feed.url);

            const existingGuids = new Set<string>();
            if (parsedFeed.items.length > 0) {
              const existing = await prisma.article.findMany({
                where: { feedId: feed.id },
                select: { guid: true },
              });
              for (const a of existing) {
                if (a.guid) existingGuids.add(a.guid);
              }
            }

            const newItems = parsedFeed.items
              .slice(0, 50)
              .filter((item) => !item.guid || !existingGuids.has(item.guid));

            if (newItems.length > 0) {
              await prisma.article.createMany({
                data: newItems.map((item) => ({
                  title: item.title,
                  url: item.url,
                  content: item.content,
                  summary: item.summary,
                  author: item.author,
                  imageUrl: item.imageUrl,
                  publishedAt: item.publishedAt,
                  guid: item.guid,
                  feedId: feed.id,
                })),
                skipDuplicates: true,
              });
              newArticles += newItems.length;
            }

            await prisma.feed.update({
              where: { id: feed.id },
              data: {
                title: parsedFeed.title || feed.title,
                siteUrl: parsedFeed.siteUrl || feed.siteUrl,
                description: parsedFeed.description || feed.description,
                imageUrl: parsedFeed.imageUrl || feed.imageUrl,
                language: parsedFeed.language || feed.language,
                lastFetched: new Date(),
                fetchError: null,
                errorCount: 0,
              },
            });
            updated++;

            send({
              type: "progress",
              current: i + 1,
              total,
              feed: feed.title || feed.url,
              status: "ok",
              feedNewArticles: newItems.length,
              newArticles,
              updated,
              failed,
            });
          } catch (err) {
            failed++;
            await prisma.feed.update({
              where: { id: feed.id },
              data: {
                fetchError: err instanceof Error ? err.message : "Unknown error",
                errorCount: { increment: 1 },
              },
            });

            send({
              type: "progress",
              current: i + 1,
              total,
              feed: feed.title || feed.url,
              status: "error",
              error: err instanceof Error ? err.message : "Unknown error",
              newArticles,
              updated,
              failed,
            });
          }
        }

        if (updated > 0) await cacheDel("sidebar:*");

        send({
          type: "complete",
          totalFeeds: total,
          updated,
          failed,
          newArticles,
        });
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
