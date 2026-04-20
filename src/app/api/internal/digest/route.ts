import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { verifyCronAuth } from "@/lib/cron-auth";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || format(new Date(), "yyyy-MM-dd");
    const source = searchParams.get("source");

    const users = await prisma.user.findMany({ select: { id: true } });

    const whereClause: Record<string, unknown> = {
      date,
      userId: { in: users.map((u: { id: string }) => u.id) },
    };

    if (source) {
      whereClause.source = source;
    } else {
      whereClause.source = { in: ["web", "scheduled"] };
    }

    const digests = await prisma.digest.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    if (digests.length === 0) {
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({
      data: digests.map((d: (typeof digests)[number]) => ({
        id: d.id,
        date: d.date,
        hours: d.hours,
        source: d.source,
        structured: d.structured,
        htmlDigest: d.htmlDigest,
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    console.error("Internal digest fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch digests" },
      { status: 500 }
    );
  }
}
