import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/redis";
import { scrapeArticle } from "@/lib/rss/scraper";
import { validateFeedUrl } from "@/lib/utils/url-validator";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { z } from "zod";

const SAVED_FEED_URL = "feed2040://saved";

const saveSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await checkRateLimit(`save-url:${userId}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 20) }
    );
  }

  try {
    const body = await req.json();
    const { url } = saveSchema.parse(body);

    // SSRF: reject private/internal targets before any fetch.
    const validation = validateFeedUrl(url);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error ?? "Invalid URL" }, { status: 400 });
    }

    // Get-or-create the user's system "Saved Articles" bucket feed.
    const savedFeed = await prisma.feed.upsert({
      where: { url_userId: { url: SAVED_FEED_URL, userId } },
      create: {
        url: SAVED_FEED_URL,
        title: "Saved Articles",
        isSystem: true,
        lastFetched: new Date(),
        userId,
      },
      update: {},
      select: { id: true },
    });

    // Dedup: if this URL is already saved, return the existing article.
    const existing = await prisma.article.findFirst({
      where: { feedId: savedFeed.id, url },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ data: { id: existing.id, duplicate: true } });
    }

    const scraped = await scrapeArticle(url);
    if (!scraped) {
      return NextResponse.json(
        { error: "Could not fetch or parse that page." },
        { status: 422 }
      );
    }

    let faviconUrl: string | null = null;
    try {
      faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
    } catch { /* ignore */ }

    const article = await prisma.article.create({
      data: {
        feedId: savedFeed.id,
        title: scraped.title,
        url,
        guid: url,
        content: scraped.content,
        summary: scraped.excerpt,
        author: scraped.author,
        imageUrl: scraped.imageUrl,
        publishedAt: new Date(),
      },
      select: { id: true, title: true },
    });

    // Keep the saved feed's favicon fresh (first save only sets it).
    if (faviconUrl) {
      await prisma.feed.update({
        where: { id: savedFeed.id },
        data: { faviconUrl },
      }).catch(() => {});
    }

    await cacheDel(`sidebar:${userId}`);

    return NextResponse.json({ data: { id: article.id, title: article.title } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Failed to save URL:", error);
    return NextResponse.json({ error: "Failed to save URL" }, { status: 500 });
  }
}
