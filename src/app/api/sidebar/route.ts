import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/redis";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const cached = await cacheGet<{ data: { categories: unknown[]; totalUnread: number } }>(`sidebar:${userId}`);
    if (cached) return NextResponse.json(cached);

    const feeds = await prisma.feed.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        faviconUrl: true,
        categories: { select: { categoryId: true } },
        _count: { select: { articles: true } },
      },
      orderBy: { title: "asc" },
    });

    // Count read articles per feed efficiently
    const feedIds = feeds.map((f: (typeof feeds)[number]) => f.id);
    let feedReadCounts: Record<string, number> = {};

    if (feedIds.length > 0) {
      const readCounts = await prisma.readArticle.findMany({
        where: {
          userId,
          article: { feedId: { in: feedIds } },
        },
        select: { article: { select: { feedId: true } } },
      });

      for (const r of readCounts) {
        feedReadCounts[r.article.feedId] = (feedReadCounts[r.article.feedId] || 0) + 1;
      }
    }

    const categories = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, slug: true, icon: true, color: true },
      orderBy: { sortOrder: "asc" },
    });

    const categoryFeeds: Record<string, { id: string; title: string; faviconUrl: string | null; unread: number; total: number }[]> = {};
    const uncategorizedFeeds: typeof categoryFeeds[string] = [];
    let totalUnread = 0;

    for (const feed of feeds) {
      const total = feed._count.articles;
      const readCount = feedReadCounts[feed.id] || 0;
      const unread = Math.max(0, total - readCount);
      totalUnread += unread;

      const feedData = { id: feed.id, title: feed.title, faviconUrl: feed.faviconUrl, unread, total };

      if (feed.categories.length === 0) {
        uncategorizedFeeds.push(feedData);
      } else {
        for (const fc of feed.categories) {
          if (!categoryFeeds[fc.categoryId]) categoryFeeds[fc.categoryId] = [];
          categoryFeeds[fc.categoryId].push(feedData);
        }
      }
    }

    const result = categories.map((cat: (typeof categories)[number]) => ({
      ...cat,
      feeds: categoryFeeds[cat.id] || [],
      unread: (categoryFeeds[cat.id] || []).reduce((s, f) => s + f.unread, 0),
    }));

    if (uncategorizedFeeds.length > 0) {
      result.push({
        id: "uncategorized",
        name: "Uncategorized",
        slug: "uncategorized",
        icon: null,
        color: null,
        feeds: uncategorizedFeeds,
        unread: uncategorizedFeeds.reduce((s, f) => s + f.unread, 0),
      });
    }

    const response = { data: { categories: result, totalUnread } };
    await cacheSet(`sidebar:${userId}`, response, 30);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Sidebar error:", error);
    return NextResponse.json({ data: { categories: [], totalUnread: 0 } });
  }
}
