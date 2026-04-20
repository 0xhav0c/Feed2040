import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  parentId: z.string().nullable().optional(),
  feedIds: z.array(z.string()).optional(),
});

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
    const category = await prisma.category.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = patchSchema.parse(body);

    const updateData: {
      name?: string;
      icon?: string;
      color?: string;
      parentId?: string | null;
    } = {};
    if (parsed.name !== undefined) updateData.name = parsed.name;
    if (parsed.icon !== undefined) updateData.icon = parsed.icon;
    if (parsed.color !== undefined) updateData.color = parsed.color;
    if (parsed.parentId !== undefined) updateData.parentId = parsed.parentId;

    if (parsed.feedIds !== undefined) {
      const validFeedIds = parsed.feedIds.filter((fid) => fid);
      const feedCount = await prisma.feed.count({
        where: { id: { in: validFeedIds }, userId: session.user.id },
      });
      if (feedCount !== validFeedIds.length) {
        return NextResponse.json({ error: "Invalid feed IDs" }, { status: 403 });
      }
      await prisma.$transaction([
        prisma.feedCategory.deleteMany({ where: { categoryId: id } }),
        ...validFeedIds.map((feedId) =>
          prisma.feedCategory.upsert({
            where: { feedId_categoryId: { feedId, categoryId: id } },
            create: { feedId, categoryId: id },
            update: {},
          })
        ),
      ]);
    }

    const updated =
      Object.keys(updateData).length > 0
        ? await prisma.category.update({
            where: { id },
            data: updateData,
          })
        : await prisma.category.findUniqueOrThrow({ where: { id } });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Failed to update category:", error);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
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
    const category = await prisma.category.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("Failed to delete category:", error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
