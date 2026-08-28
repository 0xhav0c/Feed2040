import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { embedText, toVectorLiteral } from "@/lib/ai/embeddings";

const ARTICLE_SELECT = {
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
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatArticles(articles: any[], userId: string, readIds: Set<string>, bmIds: Set<string>, tagMap: Map<string, unknown[]>) {
  return articles.map((a) => ({
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
    isRead: readIds.has(a.id),
    isBookmarked: bmIds.has(a.id),
    tags: tagMap.get(a.id) || [],
    createdAt: a.createdAt,
  }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await checkRateLimit(`semantic:${userId}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  try {
    const body = await req.json();
    const q = typeof body?.q === "string" ? body.q.trim() : "";
    if (!q) {
      return NextResponse.json({ error: "q is required" }, { status: 400 });
    }

    const vec = await embedText(userId, q);

    let orderedIds: string[] = [];
    let fallback = false;

    if (vec) {
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT a."id"
         FROM "Article" a
         JOIN "Feed" f ON f."id" = a."feedId"
         WHERE f."userId" = $2 AND a."embedding" IS NOT NULL
         ORDER BY a."embedding" <=> $1::vector
         LIMIT 30`,
        toVectorLiteral(vec),
        userId
      );
      orderedIds = rows.map((r) => r.id);
    }

    // No embeddings available (or nothing embedded yet) → keyword fallback.
    if (!vec || orderedIds.length === 0) {
      fallback = true;
      const kw = await prisma.article.findMany({
        where: {
          feed: { userId },
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { summary: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
          ],
        },
        select: ARTICLE_SELECT,
        orderBy: { createdAt: "desc" },
        take: 30,
      });
      orderedIds = kw.map((a) => a.id);
    }

    if (orderedIds.length === 0) {
      return NextResponse.json({ data: [], fallback, semantic: !fallback });
    }

    // Hydrate full rows (+ read/bookmark/tag state) and preserve rank order.
    const [articles, reads, bookmarks, tags] = await Promise.all([
      prisma.article.findMany({ where: { id: { in: orderedIds } }, select: ARTICLE_SELECT }),
      prisma.readArticle.findMany({ where: { userId, articleId: { in: orderedIds } }, select: { articleId: true } }),
      prisma.bookmark.findMany({ where: { userId, articleId: { in: orderedIds } }, select: { articleId: true } }),
      prisma.articleTag.findMany({
        where: { articleId: { in: orderedIds } },
        select: { articleId: true, tag: { select: { id: true, name: true, color: true } } },
      }),
    ]);

    const readIds = new Set(reads.map((r) => r.articleId));
    const bmIds = new Set(bookmarks.map((b) => b.articleId));
    const tagMap = new Map<string, unknown[]>();
    for (const t of tags) {
      if (!tagMap.has(t.articleId)) tagMap.set(t.articleId, []);
      tagMap.get(t.articleId)!.push(t.tag);
    }

    const byId = new Map(articles.map((a) => [a.id, a]));
    const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    const formatted = formatArticles(ordered, userId, readIds, bmIds, tagMap);

    return NextResponse.json({ data: formatted, fallback, semantic: !fallback });
  } catch (error) {
    console.error("Semantic search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
