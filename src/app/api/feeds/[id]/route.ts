import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  categoryIds: z.array(z.string()).optional(),
  scrapeFullText: z.boolean().optional(),
  refreshInterval: z.number().int().min(0).nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const feed = await prisma.feed.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        title: true,
        url: true,
        siteUrl: true,
        description: true,
        language: true,
        scrapeFullText: true,
        refreshInterval: true,
        lastFetched: true,
        fetchError: true,
        errorCount: true,
        createdAt: true,
        _count: { select: { articles: true } },
        categories: {
          select: { category: { select: { id: true, name: true } } },
        },
      },
    });
    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }
    return NextResponse.json({ data: feed });
  } catch (error) {
    console.error("Failed to get feed:", error);
    return NextResponse.json({ error: "Failed to get feed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const feed = await prisma.feed.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = patchSchema.parse(body);

    if (parsed.categoryIds !== undefined) {
      const validCount = await prisma.category.count({
        where: { id: { in: parsed.categoryIds }, userId: session.user.id },
      });
      if (validCount !== parsed.categoryIds.length) {
        return NextResponse.json({ error: "Invalid category IDs" }, { status: 403 });
      }
      await prisma.$transaction([
        prisma.feedCategory.deleteMany({ where: { feedId: id } }),
        ...parsed.categoryIds.map((categoryId) =>
          prisma.feedCategory.upsert({
            where: { feedId_categoryId: { feedId: id, categoryId } },
            create: { feedId: id, categoryId },
            update: {},
          })
        ),
      ]);
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.title) updateData.title = parsed.title;
    if (parsed.scrapeFullText !== undefined) updateData.scrapeFullText = parsed.scrapeFullText;
    if (parsed.refreshInterval !== undefined) updateData.refreshInterval = parsed.refreshInterval;

    const updated = Object.keys(updateData).length > 0
      ? await prisma.feed.update({ where: { id }, data: updateData })
      : await prisma.feed.findUniqueOrThrow({ where: { id } });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Failed to update feed:", error);
    return NextResponse.json({ error: "Failed to update feed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const feed = await prisma.feed.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!feed) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    await prisma.feed.delete({ where: { id } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("Failed to delete feed:", error);
    return NextResponse.json({ error: "Failed to delete feed" }, { status: 500 });
  }
}
