import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tags = await prisma.tag.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { articles: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    data: tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      count: t._count.articles,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 50) : "";
    const color = typeof body?.color === "string" ? body.color.slice(0, 20) : null;
    if (!name) {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
    }

    const tag = await prisma.tag.upsert({
      where: { userId_name: { userId: session.user.id, name } },
      create: { userId: session.user.id, name, color },
      update: {},
      select: { id: true, name: true, color: true },
    });

    return NextResponse.json({ data: tag }, { status: 201 });
  } catch (error) {
    console.error("Create tag error:", error);
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
