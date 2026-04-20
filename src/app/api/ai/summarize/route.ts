import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeArticle } from "@/lib/ai/summarizer";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`ai:summarize:${session.user.id}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  try {
    const body = await req.json();
    const { articleId } = body;

    if (!articleId || typeof articleId !== "string") {
      return NextResponse.json(
        { error: "articleId is required" },
        { status: 400 }
      );
    }

    const article = await prisma.article.findFirst({
      where: {
        id: articleId,
        feed: { userId: session.user.id },
      },
      include: { feed: true },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const content = article.content || article.summary || article.title;
    if (!content) {
      return NextResponse.json(
        { error: "Article has no content to summarize" },
        { status: 400 }
      );
    }

    const aiSettings = await prisma.aISettings.findUnique({
      where: { userId: session.user.id },
    });
    const language = aiSettings?.language || "tr";

    const summary = await summarizeArticle(content, language, session.user.id);

    if (!summary) {
      return NextResponse.json(
        { error: "AI API key not configured or summarization failed" },
        { status: 503 }
      );
    }

    await prisma.article.update({
      where: { id: articleId },
      data: { aiSummary: summary },
    });

    return NextResponse.json({ data: { summary } });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: "Failed to summarize article" },
      { status: 500 }
    );
  }
}
