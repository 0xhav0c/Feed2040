import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseFeed } from "@/lib/rss/parser";
import { storeNewItems } from "@/lib/rss/refresh";
import { findOrCreateCategory } from "@/lib/categories";
import { cacheDel } from "@/lib/redis";
import { validateFeedUrl } from "@/lib/utils/url-validator";

type FeedInput = {
  url: string;
  title: string;
  siteUrl?: string | null;
  category?: string;
};

const IMPORT_TIMEOUT_MS = 10_000;
const CONCURRENCY = 3;
const MAX_ARTICLES_PER_FEED = 20;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { feeds } = (await req.json()) as { feeds: FeedInput[] };
  if (!Array.isArray(feeds) || feeds.length === 0) {
    return new Response(JSON.stringify({ error: "No feeds provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cancelled = true;
        }
      }

      const stats = { success: 0, skipped: 0, failed: 0 };
      // Memoise the promise, not the id: concurrent workers asking for the
      // same new category must share one lookup/creation.
      const categoryCache = new Map<string, Promise<string>>();

      function resolveCategory(categoryName: string): Promise<string | null> {
        if (!categoryName || categoryName === "Uncategorized") return Promise.resolve(null);
        let pending = categoryCache.get(categoryName);
        if (!pending) {
          pending = findOrCreateCategory(userId, categoryName);
          categoryCache.set(categoryName, pending);
          pending.catch(() => categoryCache.delete(categoryName));
        }
        return pending;
      }

      async function processFeed(feed: FeedInput, index: number) {
        if (cancelled) return;

        send({ type: "processing", index, title: feed.title });

        try {
          const existing = await prisma.feed.findUnique({
            where: { url_userId: { url: feed.url, userId } },
          });

          if (existing) {
            stats.skipped++;
            send({ type: "skipped", index, title: existing.title, reason: "Already subscribed" });
            return;
          }

          const validation = validateFeedUrl(feed.url);
          if (!validation.valid) {
            throw new Error(validation.error ?? "Invalid feed URL");
          }

          const parsed = await parseFeedWithTimeout(feed.url, IMPORT_TIMEOUT_MS);

          const categoryId = await resolveCategory(feed.category || "");

          const created = await prisma.feed.create({
            data: {
              url: feed.url,
              title: parsed.title || feed.title || feed.url,
              siteUrl: parsed.siteUrl,
              description: parsed.description,
              imageUrl: parsed.imageUrl,
              language: parsed.language,
              lastFetched: new Date(),
              userId,
              ...(categoryId
                ? { categories: { create: { categoryId } } }
                : {}),
            },
          });

          const articleCount = await storeNewItems(
            created.id,
            parsed.items.slice(0, MAX_ARTICLES_PER_FEED)
          );

          stats.success++;
          send({ type: "success", index, title: created.title, articleCount });
        } catch (err) {
          stats.failed++;
          const reason = err instanceof Error ? err.message : "Unknown error";
          send({ type: "failed", index, title: feed.title, reason });
        }
      }

      // Semaphore-based concurrency control
      let nextIndex = 0;

      async function worker() {
        while (nextIndex < feeds.length && !cancelled) {
          const i = nextIndex++;
          await processFeed(feeds[i], i);
        }
      }

      const workers = Array.from(
        { length: Math.min(CONCURRENCY, feeds.length) },
        () => worker()
      );
      await Promise.all(workers);

      if (stats.success > 0) await cacheDel(`sidebar:${userId}`);
      send({ type: "done", stats });

      try {
        controller.close();
      } catch {
        // already closed
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function parseFeedWithTimeout(
  url: string,
  timeoutMs: number
): ReturnType<typeof parseFeed> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout after ${timeoutMs / 1000}s`)),
      timeoutMs
    );

    parseFeed(url)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
