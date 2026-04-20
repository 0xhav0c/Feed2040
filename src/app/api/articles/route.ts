import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("q")?.trim() || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const feedId = searchParams.get("feedId") || "";
    const categoryId = searchParams.get("categoryId") || "";
    const filter = searchParams.get("filter") || "";
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      feed: { userId: session.user.id },
    };

    if (feedId) {
      where.feedId = feedId;
    }

    if (categoryId) {
      where.feed = {
        ...where.feed,
        categories: { some: { categoryId } },
      };
    }

    if (filter === "unread") {
      where.readArticles = { none: { userId: session.user.id } };
    } else if (filter === "today") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      where.publishedAt = { gte: todayStart };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
        { author: { contains: search, mode: "insensitive" } },
        { feed: { title: { contains: search, mode: "insensitive" } } },
      ];
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const baseWhere: Record<string, unknown> = {
      feed: { userId: session.user.id },
      ...(feedId ? { feedId } : {}),
      ...(categoryId ? { feed: { userId: session.user.id, categories: { some: { categoryId } } } } : {}),
    };

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
          feed: { select: { id: true, title: true, faviconUrl: true } },
          bookmarks: {
            where: { userId: session.user.id },
            select: { id: true },
          },
          readArticles: {
            where: { userId: session.user.id },
            select: { id: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.article.count({ where }),
      prisma.article.count({
        where: { ...baseWhere, publishedAt: { gte: todayStart } },
      }),
      prisma.article.count({
        where: {
          ...baseWhere,
          readArticles: { none: { userId: session.user.id } },
        },
      }),
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
      feed: a.feed,
      isRead: a.readArticles.length > 0,
      isBookmarked: a.bookmarks.length > 0,
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
