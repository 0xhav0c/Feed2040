import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await req.json();
    const articleId = typeof body?.articleId === "string" ? body.articleId : "";
    const action = body?.action === "remove" ? "remove" : "add";
    const tagId = typeof body?.tagId === "string" ? body.tagId : "";
    const tagName = typeof body?.tagName === "string" ? body.tagName.trim().slice(0, 50) : "";

    if (!articleId) {
      return NextResponse.json({ error: "articleId is required" }, { status: 400 });
    }

    // Verify the article belongs to one of the caller's feeds (IDOR guard).
    const article = await prisma.article.findFirst({
      where: { id: articleId, feed: { userId } },
      select: { id: true },
    });
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    // Resolve the tag (by id, or create/find by name), always user-scoped.
    let resolvedTagId = "";
    if (tagId) {
      const tag = await prisma.tag.findFirst({
        where: { id: tagId, userId },
        select: { id: true },
      });
      if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });
      resolvedTagId = tag.id;
    } else if (tagName) {
      const tag = await prisma.tag.upsert({
        where: { userId_name: { userId, name: tagName } },
        create: { userId, name: tagName },
        update: {},
        select: { id: true },
      });
      resolvedTagId = tag.id;
    } else {
      return NextResponse.json({ error: "tagId or tagName is required" }, { status: 400 });
    }

    if (action === "remove") {
      await prisma.articleTag.deleteMany({
        where: { articleId, tagId: resolvedTagId },
      });
    } else {
      await prisma.articleTag.upsert({
        where: { articleId_tagId: { articleId, tagId: resolvedTagId } },
        create: { articleId, tagId: resolvedTagId },
        update: {},
      });
    }

    const tags = await prisma.articleTag.findMany({
      where: { articleId },
      select: { tag: { select: { id: true, name: true, color: true } } },
    });

    return NextResponse.json({ data: { tags: tags.map((t) => t.tag) } });
  } catch (error) {
    console.error("Tag article error:", error);
    return NextResponse.json({ error: "Failed to update tags" }, { status: 500 });
  }
}
