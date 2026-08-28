import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { suggestTags } from "@/lib/ai/summarizer";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await checkRateLimit(`ai:tags:${userId}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  try {
    const body = await req.json();
    const articleId = typeof body?.articleId === "string" ? body.articleId : "";
    if (!articleId) {
      return NextResponse.json({ error: "articleId is required" }, { status: 400 });
    }

    const article = await prisma.article.findFirst({
      where: { id: articleId, feed: { userId } },
      select: { title: true, content: true, summary: true },
    });
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const existing = await prisma.tag.findMany({
      where: { userId },
      select: { name: true },
      orderBy: { name: "asc" },
      take: 100,
    });

    const suggestions = await suggestTags(
      article.title,
      article.content || article.summary || "",
      existing.map((t) => t.name),
      userId
    );

    return NextResponse.json({ data: { tags: suggestions } });
  } catch (error) {
    console.error("Suggest tags error:", error);
    return NextResponse.json({ error: "Failed to suggest tags" }, { status: 500 });
  }
}
