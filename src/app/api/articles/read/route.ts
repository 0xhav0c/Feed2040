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
    const { articleId } = await req.json();
    if (!articleId) {
      return NextResponse.json({ error: "articleId is required" }, { status: 400 });
    }

    const article = await prisma.article.findFirst({
      where: { id: articleId, feed: { userId: session.user.id } },
    });
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    await prisma.readArticle.upsert({
      where: { userId_articleId: { userId: session.user.id, articleId } },
      create: { userId: session.user.id, articleId },
      update: {},
    });

    await cacheDel("sidebar:*");
    return NextResponse.json({ data: { read: true } });
  } catch (error) {
    console.error("Failed to mark as read:", error);
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { articleId } = await req.json();
    if (!articleId) {
      return NextResponse.json({ error: "articleId is required" }, { status: 400 });
    }

    const article = await prisma.article.findFirst({
      where: { id: articleId, feed: { userId: session.user.id } },
    });
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    await prisma.readArticle.deleteMany({
      where: { userId: session.user.id, articleId },
    });

    await cacheDel("sidebar:*");
    return NextResponse.json({ data: { read: false } });
  } catch (error) {
    console.error("Failed to mark as unread:", error);
    return NextResponse.json({ error: "Failed to mark as unread" }, { status: 500 });
  }
}
