import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/redis";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { feedId, categoryId, filter } = body as {
      feedId?: string;
      categoryId?: string;
      filter?: string;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      feed: { userId: session.user.id },
      readArticles: { none: { userId: session.user.id } },
    };

    if (feedId) where.feedId = feedId;

    if (categoryId) {
      where.feed = {
        ...where.feed,
        categories: { some: { categoryId } },
      };
    }

    if (filter === "today") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      where.publishedAt = { gte: todayStart };
    }

    const unreadArticles = await prisma.article.findMany({
      where,
      select: { id: true },
      take: 5000,
    });

    if (unreadArticles.length === 0) {
      return NextResponse.json({ data: { marked: 0 } });
    }

    const articleIds = unreadArticles.map((a: { id: string }) => a.id);

    const userId = session.user.id as string;
    await prisma.readArticle.createMany({
      data: articleIds.map((articleId: string) => ({
        userId,
        articleId,
      })),
      skipDuplicates: true,
    });

    await cacheDel("sidebar:*");

    return NextResponse.json({ data: { marked: articleIds.length } });
  } catch (error) {
    console.error("Failed to mark all as read:", error);
    return NextResponse.json(
      { error: "Failed to mark all as read" },
      { status: 500 }
    );
  }
}
