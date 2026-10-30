import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/redis";
import { buildArticleWhere } from "@/lib/article-scope";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`readall:${session.user.id}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 10) }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const userId = session.user.id as string;

    // Same scope as GET /api/articles so "mark all" only touches what the
    // current view (feed/category/tag/saved/search/filter) actually lists.
    const where = buildArticleWhere(userId, {
      feedId: str(body.feedId),
      categoryId: str(body.categoryId),
      tagId: str(body.tagId),
      saved: body.saved === true || body.saved === "1",
      search: str(body.q),
      filter: str(body.filter),
      tz: str(body.tz),
    });
    where.readArticles = { none: { userId } };

    // Batch through the whole backlog instead of silently stopping at a cap.
    let marked = 0;
    for (;;) {
      const batch = await prisma.article.findMany({
        where,
        select: { id: true },
        take: 5000,
      });
      if (batch.length === 0) break;
      const result = await prisma.readArticle.createMany({
        data: batch.map((a: { id: string }) => ({ userId, articleId: a.id })),
        skipDuplicates: true,
      });
      marked += result.count;
      if (batch.length < 5000 || result.count === 0) break;
    }

    if (marked === 0) {
      return NextResponse.json({ data: { marked: 0 } });
    }

    await cacheDel("sidebar:*");

    return NextResponse.json({ data: { marked } });
  } catch (error) {
    console.error("Failed to mark all as read:", error);
    return NextResponse.json(
      { error: "Failed to mark all as read" },
      { status: 500 }
    );
  }
}
