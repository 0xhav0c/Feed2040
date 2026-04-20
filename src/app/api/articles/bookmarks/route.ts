import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: session.user.id },
      include: {
        article: {
          include: { feed: { select: { id: true, title: true, faviconUrl: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = bookmarks.map((bm: (typeof bookmarks)[number]) => ({
      id: bm.article.id, title: bm.article.title, url: bm.article.url,
      content: bm.article.content, summary: bm.article.summary,
      aiSummary: bm.article.aiSummary, author: bm.article.author,
      imageUrl: bm.article.imageUrl, publishedAt: bm.article.publishedAt,
      enclosureUrl: bm.article.enclosureUrl, enclosureType: bm.article.enclosureType,
      enclosureDuration: bm.article.enclosureDuration,
      feed: bm.article.feed, isRead: true, isBookmarked: true,
      createdAt: bm.article.createdAt,
    }));

    return NextResponse.json({ data: formatted });
  } catch (error) {
    console.error("Failed to fetch bookmarks:", error);
    return NextResponse.json({ error: "Failed to fetch bookmarks" }, { status: 500 });
  }
}
