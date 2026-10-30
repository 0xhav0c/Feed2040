import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateKeyInTz, dayRangeInTz, resolveTimezone } from "@/lib/timezone";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // Day/week boundaries in the viewer's timezone (the server runs in UTC).
    const tz = resolveTimezone(new URL(req.url).searchParams.get("tz"));
    const now = new Date();
    const startOfToday = dayRangeInTz(tz, now).start;
    const dayOfWeek = new Date(`${dateKeyInTz(tz, now)}T12:00:00Z`).getUTCDay();
    const startOfWeek = dayRangeInTz(tz, new Date(now.getTime() - dayOfWeek * 86_400_000)).start;

    const [
      userCounts,
      readStats,
      articleStats,
      feedsWithCounts,
      articlesPerDay,
      topFeedsThisWeek,
    ] = await Promise.all([
      // Merge totalFeeds, totalBookmarks, totalCategories into one query
      prisma.$queryRaw<[{ feeds: bigint; bookmarks: bigint; categories: bigint }]>`
        SELECT
          (SELECT COUNT(*) FROM "Feed" WHERE "userId" = ${userId}) as feeds,
          (SELECT COUNT(*) FROM "Bookmark" WHERE "userId" = ${userId}) as bookmarks,
          (SELECT COUNT(*) FROM "Category" WHERE "userId" = ${userId}) as categories
      `,
      // Merge readCount, readToday, readThisWeek into one query
      prisma.$queryRaw<[{ total: bigint; today: bigint; this_week: bigint }]>`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE "readAt" >= ${startOfToday}) as today,
          COUNT(*) FILTER (WHERE "readAt" >= ${startOfWeek}) as this_week
        FROM "ReadArticle"
        WHERE "userId" = ${userId}
      `,
      // Merge totalArticles, articlesToday, articlesThisWeek into one query
      prisma.$queryRaw<[{ total: bigint; today: bigint; this_week: bigint }]>`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE "publishedAt" >= ${startOfToday}) as today,
          COUNT(*) FILTER (WHERE "publishedAt" >= ${startOfWeek}) as this_week
        FROM "Article"
        WHERE "feedId" IN (SELECT id FROM "Feed" WHERE "userId" = ${userId})
      `,
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
      prisma.$queryRaw<{ feedId: string; title: string; count: bigint }[]>`
        SELECT f.id as "feedId", f.title, COUNT(a.id)::bigint as count
        FROM "Article" a
        JOIN "Feed" f ON a."feedId" = f.id
        WHERE f."userId" = ${userId}
          AND a."publishedAt" >= ${startOfWeek}
        GROUP BY f.id, f.title
        ORDER BY count DESC
        LIMIT 5
      `,
    ]);

    const totalFeeds = Number(userCounts[0].feeds);
    const totalArticles = Number(articleStats[0].total);
    const totalBookmarks = Number(userCounts[0].bookmarks);
    const totalCategories = Number(userCounts[0].categories);
    const readCount = Number(readStats[0].total);
    const readToday = Number(readStats[0].today);
    const readThisWeek = Number(readStats[0].this_week);
    const articlesToday = Number(articleStats[0].today);
    const articlesThisWeek = Number(articleStats[0].this_week);

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

    const healthyCount = feedsWithCounts.filter(
      (f: (typeof feedsWithCounts)[number]) => !f.fetchError && f.errorCount === 0
    ).length;
    const errorFeedCount = feedsWithCounts.filter(
      (f: (typeof feedsWithCounts)[number]) => f.errorCount > 0
    ).length;

    return NextResponse.json({
      data: {
        overview: {
          totalFeeds,
          totalArticles,
          totalBookmarks,
          totalCategories,
          readCount,
          unreadCount,
          readToday,
          readThisWeek,
          articlesToday,
          articlesThisWeek,
        },
        articlesByDay,
        topFeeds,
        topFeedsThisWeek: topFeedsThisWeek.map((f) => ({
          title: f.title,
          count: Number(f.count),
        })),
        feedHealth,
        feedHealthSummary: {
          healthy: healthyCount,
          errors: errorFeedCount,
        },
      },
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
