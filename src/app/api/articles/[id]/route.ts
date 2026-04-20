import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapeFullText } from "@/lib/rss/scraper";

const SCRAPE_MIN_IMPROVEMENT = 500;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const article = await prisma.article.findFirst({
      where: { id, feed: { userId: session.user.id } },
      include: {
        feed: { select: { id: true, title: true, faviconUrl: true, scrapeFullText: true } },
        bookmarks: {
          where: { userId: session.user.id },
          select: { id: true },
        },
        readArticles: {
          where: { userId: session.user.id },
          select: { id: true },
        },
      },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    let { content } = article;

    if (article.feed.scrapeFullText && article.url) {
      const scraped = await scrapeFullText(article.url);
      if (scraped && scraped.length > (content?.length || 0) + SCRAPE_MIN_IMPROVEMENT) {
        content = scraped;
        prisma.article.update({
          where: { id: article.id },
          data: { content: scraped },
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      data: {
        id: article.id,
        title: article.title,
        url: article.url,
        content,
        summary: article.summary,
        aiSummary: article.aiSummary,
        author: article.author,
        imageUrl: article.imageUrl,
        publishedAt: article.publishedAt,
        feed: article.feed,
        isRead: article.readArticles.length > 0,
        isBookmarked: article.bookmarks.length > 0,
        createdAt: article.createdAt,
      },
    });
  } catch (error) {
    console.error("Failed to fetch article:", error);
    return NextResponse.json(
      { error: "Failed to fetch article" },
      { status: 500 }
    );
  }
}
