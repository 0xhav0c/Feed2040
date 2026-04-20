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
    const includeBookmarks = searchParams.get("bookmarks") === "true";

    const [feeds, categories, bookmarks] = await Promise.all([
      prisma.feed.findMany({
        where: { userId: session.user.id },
        include: {
          categories: {
            include: { category: { select: { id: true, slug: true } } },
          },
        },
      }),
      prisma.category.findMany({
        where: { userId: session.user.id },
        orderBy: { sortOrder: "asc" },
      }),
      includeBookmarks
        ? prisma.bookmark.findMany({
            where: { userId: session.user.id },
            include: {
              article: {
                include: { feed: { select: { url: true, title: true } } },
              },
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

    const exportFeeds = feeds.map((f: (typeof feeds)[number]) => ({
      url: f.url,
      title: f.title,
      siteUrl: f.siteUrl,
      description: f.description,
      imageUrl: f.imageUrl,
      faviconUrl: f.faviconUrl,
      language: f.language,
      categorySlugs: f.categories.map((fc: (typeof f.categories)[number]) => fc.category.slug),
    }));

    const exportCategories = categories.map((c: (typeof categories)[number]) => ({
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      color: c.color,
      parentSlug: categories.find((p: (typeof categories)[number]) => p.id === c.parentId)?.slug ?? null,
      sortOrder: c.sortOrder,
    }));

    const exportBookmarks = bookmarks.map((bm: (typeof bookmarks)[number]) => ({
      articleUrl: bm.article.url,
      articleTitle: bm.article.title,
      feedUrl: bm.article.feed.url,
      feedTitle: bm.article.feed.title,
      note: bm.note,
      createdAt: bm.createdAt,
    }));

    const payload = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      feeds: exportFeeds,
      categories: exportCategories,
      ...(includeBookmarks && { bookmarks: exportBookmarks }),
    };

    const json = JSON.stringify(payload, null, 2);

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="feed2040-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("Export JSON error:", error);
    return NextResponse.json({ error: "Failed to export" }, { status: 500 });
  }
}
