import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  articleId: z.string().min(1),
  text: z.string().min(1).max(5000),
  note: z.string().max(2000).optional(),
  color: z.string().max(20).optional(),
});

// GET /api/highlights?articleId=... — highlights for one article (owner only)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const articleId = new URL(req.url).searchParams.get("articleId") || "";
    if (!articleId) {
      return NextResponse.json({ error: "articleId is required" }, { status: 400 });
    }
    const highlights = await prisma.highlight.findMany({
      where: { articleId, userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ data: highlights });
  } catch (error) {
    console.error("Failed to fetch highlights:", error);
    return NextResponse.json({ error: "Failed to fetch highlights" }, { status: 500 });
  }
}

// POST /api/highlights — create a highlight on an owned article
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);

    // Ownership: article must belong to the caller (via its feed).
    const article = await prisma.article.findFirst({
      where: { id: parsed.articleId, feed: { userId: session.user.id } },
      select: { id: true },
    });
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const count = await prisma.highlight.count({
      where: { articleId: parsed.articleId, userId: session.user.id },
    });
    if (count >= 200) {
      return NextResponse.json({ error: "Too many highlights on this article" }, { status: 400 });
    }

    const highlight = await prisma.highlight.create({
      data: {
        userId: session.user.id,
        articleId: parsed.articleId,
        text: parsed.text,
        note: parsed.note || null,
        color: parsed.color || null,
      },
    });

    return NextResponse.json({ data: highlight }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Failed to create highlight:", error);
    return NextResponse.json({ error: "Failed to create highlight" }, { status: 500 });
  }
}
