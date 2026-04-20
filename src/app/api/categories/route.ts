import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
  parentId: z.string().nullable().optional(),
});

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string(), sortOrder: z.number() })),
});

type CategoryWithChildren = Awaited<
  ReturnType<typeof prisma.category.findMany<{
    include: { _count: { select: { feeds: true } } };
  }>>
>[number] & { children: CategoryWithChildren[] };

function buildCategoryTree(
  flat: CategoryWithChildren[]
): CategoryWithChildren[] {
  const byId = new Map<string, CategoryWithChildren>();
  for (const c of flat) {
    byId.set(c.id, { ...c, children: [] });
  }
  const roots: CategoryWithChildren[] = [];
  for (const c of flat) {
    const node = byId.get(c.id)!;
    if (c.parentId) {
      const parent = byId.get(c.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortChildren = (nodes: CategoryWithChildren[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    nodes.forEach((n) => sortChildren(n.children));
  };
  sortChildren(roots);
  return roots;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const flat = await prisma.category.findMany({
      where: { userId: session.user.id },
      include: { _count: { select: { feeds: true } } },
      orderBy: { sortOrder: "asc" },
    });
    const categories = buildCategoryTree(flat as CategoryWithChildren[]);
    return NextResponse.json({ data: categories });
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, slug, icon, color, parentId } = createCategorySchema.parse(body);

    const existing = await prisma.category.findUnique({
      where: { slug_userId: { slug, userId: session.user.id } },
    });

    if (existing) {
      return NextResponse.json({ error: "Category already exists" }, { status: 409 });
    }

    const count = await prisma.category.count({
      where: {
        userId: session.user.id,
        parentId: parentId ?? null,
      },
    });

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        icon,
        color,
        parentId: parentId ?? null,
        sortOrder: count,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ data: category }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Failed to create category:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await req.json();
    const { items } = reorderSchema.parse(body);

    await prisma.$transaction(
      items.map(({ id, sortOrder }) =>
        prisma.category.updateMany({
          where: { id, userId },
          data: { sortOrder },
        })
      )
    );

    return NextResponse.json({ data: { reordered: true } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Failed to reorder categories:", error);
    return NextResponse.json({ error: "Failed to reorder categories" }, { status: 500 });
  }
}
