import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  const digests = await prisma.digest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      date: true,
      hours: true,
      source: true,
      createdAt: true,
      structured: true,
    },
  });

  const data = digests.map((d: (typeof digests)[number]) => {
    let itemCount = 0;
    if (d.structured) {
      const sections = d.structured as Array<{ items?: unknown[] }>;
      if (Array.isArray(sections)) {
        itemCount = sections.reduce(
          (sum, s) => sum + (Array.isArray(s.items) ? s.items.length : 0),
          0
        );
      }
    }
    return {
      id: d.id,
      date: d.date,
      hours: d.hours,
      source: d.source,
      createdAt: d.createdAt,
      itemCount,
    };
  });

  return NextResponse.json({ data });
}
