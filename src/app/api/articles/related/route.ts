import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "will",
  "been", "more", "about", "into", "than", "also", "just", "your", "what",
  "when", "which", "their", "there", "would", "could", "should", "other",
  "some", "were", "they", "does", "are", "but", "not", "you", "all",
  "can", "had", "her", "was", "one", "our", "out", "how", "has",
  "new", "use", "get", "may", "its", "via", "over", "after", "before",
  // Turkish
  "bir", "ve", "ile", "için", "olan", "olarak", "gibi", "daha", "ancak",
  "ama", "veya", "çok", "nasıl", "neden", "kadar", "sonra", "önce",
  // German
  "und", "der", "die", "das", "ein", "eine", "ist", "mit", "auf",
  // French
  "les", "des", "une", "est", "dans", "pour", "que", "sur", "par",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const articleId = searchParams.get("articleId");

    if (!articleId) {
      return NextResponse.json({ error: "articleId is required" }, { status: 400 });
    }

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        summary: true,
        feedId: true,
        feed: {
          select: {
            userId: true,
            categories: { select: { categoryId: true } },
          },
        },
      },
    });

    if (!article || article.feed.userId !== session.user.id) {
      return NextResponse.json({ data: [] });
    }

    const sourceText = `${article.title} ${(article.summary || "").slice(0, 200)}`;
    const words = extractKeywords(sourceText);
    const uniqueWords = [...new Set(words)].slice(0, 8);

    if (uniqueWords.length < 1) {
      return NextResponse.json({ data: [] });
    }

    const categoryIds = article.feed.categories.map((c) => c.categoryId);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orConditions = uniqueWords.map((word) => ({
      title: { contains: word, mode: "insensitive" as const },
    }));

    const candidates = await prisma.article.findMany({
      where: {
        id: { not: articleId },
        feed: { userId: session.user.id },
        OR: orConditions,
      },
      select: {
        id: true,
        title: true,
        url: true,
        publishedAt: true,
        feedId: true,
        feed: {
          select: {
            title: true,
            categories: { select: { categoryId: true } },
          },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });

    const scored = candidates.map((a) => {
      const titleLower = a.title.toLowerCase();
      const matchCount = uniqueWords.filter((w) => titleLower.includes(w)).length;

      let score = matchCount;

      const aCatIds = a.feed.categories.map((c) => c.categoryId);
      const sameCategory = categoryIds.some((id) => aCatIds.includes(id));
      if (sameCategory) score += 1.5;

      if (a.feedId === article.feedId) score += 1;

      if (a.publishedAt && a.publishedAt > thirtyDaysAgo) score += 0.5;

      return { ...a, score, matchCount };
    });

    const result = scored
      .filter((a) => a.matchCount >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        title: a.title,
        url: a.url,
        feedTitle: a.feed.title,
        publishedAt: a.publishedAt,
      }));

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("Failed to fetch related articles:", error);
    return NextResponse.json({ error: "Failed to fetch related articles" }, { status: 500 });
  }
}
