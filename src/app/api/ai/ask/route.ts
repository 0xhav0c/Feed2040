import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { askAboutArticle } from "@/lib/ai/summarizer";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`ai:ask:${session.user.id}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  try {
    const body = await req.json();
    const { articleId, question } = body as {
      articleId?: string;
      question?: string;
    };

    if (!articleId || typeof articleId !== "string") {
      return NextResponse.json({ error: "articleId is required" }, { status: 400 });
    }
    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const article = await prisma.article.findFirst({
      where: { id: articleId, feed: { userId: session.user.id } },
      select: { content: true, summary: true, title: true },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const content = article.content || article.summary || article.title;
    if (!content) {
      return NextResponse.json({ error: "Article has no content" }, { status: 400 });
    }

    const aiSettings = await prisma.aISettings.findUnique({
      where: { userId: session.user.id },
    });
    const language = aiSettings?.language || "en";

    const answer = await askAboutArticle(content, question, language, session.user.id);

    if (!answer) {
      return NextResponse.json(
        { error: "AI API key not configured or request failed" },
        { status: 503 }
      );
    }

    return NextResponse.json({ data: { answer } });
  } catch (error) {
    console.error("Ask error:", error);
    return NextResponse.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
