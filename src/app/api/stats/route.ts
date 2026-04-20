import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const [
      totalFeeds,
      totalArticles,
      totalBookmarks,
      totalCategories,
      readCount,
      feedsWithCounts,
      articlesPerDay,
    ] = await Promise.all([
      prisma.feed.count({ where: { userId } }),
      prisma.article.count({ where: { feed: { userId } } }),
      prisma.bookmark.count({ where: { userId } }),
      prisma.category.count({ where: { userId } }),
      prisma.readArticle.count({ where: { userId } }),
      prisma.feed.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          faviconUrl: true,
          lastFetched: true,
          fetchError: true,
          errorCount: true,
          _count: { select: { articles: true } },
        },
        orderBy: { title: "asc" },
      }),
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE("publishedAt") as date, COUNT(*)::bigint as count
        FROM "Article"
        WHERE "feedId" IN (SELECT id FROM "Feed" WHERE "userId" = ${userId})
          AND "publishedAt" >= NOW() - INTERVAL '14 days'
        GROUP BY DATE("publishedAt")
        ORDER BY date ASC
      `,
    ]);

    const unreadCount = totalArticles - readCount;

    const articlesByDay = articlesPerDay.map((r: (typeof articlesPerDay)[number]) => ({
      date: typeof r.date === "string" ? r.date : new Date(r.date).toISOString().slice(0, 10),
      count: Number(r.count),
    }));

    const topFeeds = feedsWithCounts
      .sort((a: (typeof feedsWithCounts)[number], b: (typeof feedsWithCounts)[number]) => b._count.articles - a._count.articles)
      .slice(0, 10)
      .map((f: (typeof feedsWithCounts)[number]) => ({
        id: f.id,
        title: f.title,
        faviconUrl: f.faviconUrl,
        articleCount: f._count.articles,
        lastFetched: f.lastFetched,
        fetchError: f.fetchError,
      }));

    const feedHealth = feedsWithCounts.map((f: (typeof feedsWithCounts)[number]) => ({
      id: f.id,
      title: f.title,
      faviconUrl: f.faviconUrl,
      articleCount: f._count.articles,
      lastFetched: f.lastFetched,
      healthy: !f.fetchError,
      errorCount: f.errorCount,
      fetchError: f.fetchError,
    }));

    return NextResponse.json({
      data: {
        overview: {
          totalFeeds,
          totalArticles,
          totalBookmarks,
          totalCategories,
          readCount,
          unreadCount,
        },
        articlesByDay,
        topFeeds,
        feedHealth,
      },
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
