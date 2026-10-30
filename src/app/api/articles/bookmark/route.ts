import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { articleId, bookmarked } = await req.json();
    if (!articleId) {
      return NextResponse.json({ error: "articleId is required" }, { status: 400 });
    }

    const article = await prisma.article.findFirst({
      where: { id: articleId, feed: { userId: session.user.id } },
    });
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    // Explicit form: set the desired state (idempotent), so a client whose
    // view is stale can't flip the bookmark the wrong way.
    if (typeof bookmarked === "boolean") {
      if (bookmarked) {
        await prisma.bookmark.upsert({
          where: { userId_articleId: { userId: session.user.id, articleId } },
          create: { userId: session.user.id, articleId },
          update: {},
        });
      } else {
        await prisma.bookmark.deleteMany({ where: { userId: session.user.id, articleId } });
      }
      return NextResponse.json({ data: { bookmarked } });
    }

    const existing = await prisma.bookmark.findUnique({
      where: { userId_articleId: { userId: session.user.id, articleId } },
    });

    if (existing) {
      await prisma.bookmark.delete({ where: { id: existing.id } });
      return NextResponse.json({ data: { bookmarked: false } });
    }

    await prisma.bookmark.create({ data: { userId: session.user.id, articleId } });
    return NextResponse.json({ data: { bookmarked: true } }, { status: 201 });
  } catch (error) {
    console.error("Failed to toggle bookmark:", error);
    return NextResponse.json({ error: "Failed to toggle bookmark" }, { status: 500 });
  }
}
