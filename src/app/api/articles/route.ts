import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildArticleWhere, todayRange, type ArticleScope } from "@/lib/article-scope";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 100);
    const skip = (page - 1) * limit;
    const userId = session.user.id;

    const scope: ArticleScope = {
      feedId: searchParams.get("feedId") || "",
      categoryId: searchParams.get("categoryId") || "",
      tagId: searchParams.get("tagId") || "",
      saved: searchParams.get("saved") === "1",
      search: searchParams.get("q")?.trim() || "",
      filter: searchParams.get("filter") || "",
      tz: searchParams.get("tz"),
      readSince: parseDate(searchParams.get("readSince")),
    };

    const where = buildArticleWhere(userId, scope);
    // Counters describe the whole view, independent of the Today/Unread toggle.
    const viewWhere = buildArticleWhere(userId, scope, false);

    const [articles, total, todayCount, unreadCount] = await Promise.all([
      prisma.article.findMany({
        where,
        select: {
          id: true,
          title: true,
          url: true,
          summary: true,
          aiSummary: true,
          author: true,
          imageUrl: true,
          publishedAt: true,
          createdAt: true,
          enclosureUrl: true,
          enclosureType: true,
          enclosureDuration: true,
          feed: { select: { id: true, title: true, url: true, siteUrl: true, faviconUrl: true, language: true } },
          bookmarks: {
            where: { userId },
            select: { id: true },
          },
          readArticles: {
            where: { userId },
            select: { id: true },
          },
          tags: {
            select: { tag: { select: { id: true, name: true, color: true } } },
          },
        },
        // createMany gives a whole refresh batch the same createdAt; seq breaks
        // the tie so OFFSET pages never overlap or skip rows.
        orderBy: [{ createdAt: "desc" }, { seq: "desc" }],
        skip,
        take: limit,
      }),
      prisma.article.count({ where }),
      prisma.article.count({ where: { ...viewWhere, publishedAt: todayRange(scope.tz) } }),
      prisma.article.count({ where: { ...viewWhere, readArticles: { none: { userId } } } }),
    ]);

    const formatted = articles.map((a: (typeof articles)[number]) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      content: null as string | null,
      summary: a.summary,
      aiSummary: a.aiSummary,
      author: a.author,
      imageUrl: a.imageUrl,
      publishedAt: a.publishedAt,
      enclosureUrl: a.enclosureUrl,
      enclosureType: a.enclosureType,
      enclosureDuration: a.enclosureDuration,
      feed: a.feed,
      isRead: a.readArticles.length > 0,
      isBookmarked: a.bookmarks.length > 0,
      tags: a.tags.map((t) => t.tag),
      createdAt: a.createdAt,
    }));

    return NextResponse.json({
      data: formatted,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: { today: todayCount, unread: unreadCount },
    });
  } catch (error) {
    console.error("Failed to fetch articles:", error);
    return NextResponse.json(
      { error: "Failed to fetch articles" },
      { status: 500 }
    );
  }
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
