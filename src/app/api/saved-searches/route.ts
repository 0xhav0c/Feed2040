import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  query: z.string().min(1).max(200),
  feedId: z.string().max(50).optional().nullable(),
  categoryId: z.string().max(50).optional().nullable(),
  filter: z.enum(["", "unread", "today"]).optional().nullable(),
  notify: z.boolean().optional(),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const searches = await prisma.savedSearch.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: searches });
  } catch (error) {
    console.error("Failed to fetch saved searches:", error);
    return NextResponse.json({ error: "Failed to fetch saved searches" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const parsed = createSchema.parse(await req.json());

    const count = await prisma.savedSearch.count({ where: { userId: session.user.id } });
    if (count >= 50) {
      return NextResponse.json({ error: "Maximum 50 saved searches allowed" }, { status: 400 });
    }

    // Ownership check for optional scopes (prevents referencing another user's feed/category).
    if (parsed.feedId) {
      const owned = await prisma.feed.count({ where: { id: parsed.feedId, userId: session.user.id } });
      if (!owned) return NextResponse.json({ error: "Invalid feed" }, { status: 400 });
    }
    if (parsed.categoryId) {
      const owned = await prisma.category.count({ where: { id: parsed.categoryId, userId: session.user.id } });
      if (!owned) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const search = await prisma.savedSearch.create({
      data: {
        userId: session.user.id,
        name: parsed.name,
        query: parsed.query,
        feedId: parsed.feedId || null,
        categoryId: parsed.categoryId || null,
        filter: parsed.filter || null,
        notify: parsed.notify ?? false,
      },
    });
    return NextResponse.json({ data: search }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Failed to create saved search:", error);
    return NextResponse.json({ error: "Failed to create saved search" }, { status: 500 });
  }
}
