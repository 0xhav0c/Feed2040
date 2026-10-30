import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatStructuredDigest } from "@/lib/telegram/bot";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { generateAndStoreDigest, userTodayKey } from "@/lib/ai/digest-service";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || (await userTodayKey(session.user.id));

  const digests = await prisma.digest.findMany({
    where: { userId: session.user.id, date },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    data: digests.map((d: { id: string; date: string; hours: number; source: string; structured: unknown; createdAt: Date }) => ({
      id: d.id,
      date: d.date,
      hours: d.hours,
      source: d.source,
      structured: d.structured,
      createdAt: d.createdAt,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`ai:digest:${session.user.id}`, 5, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 5) }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const raw = body as {
      categoryIds?: string[];
      categoryId?: string;
      hours?: number;
      forceRefresh?: boolean;
    };
    const hours = Number(raw.hours ?? 24) || 24;
    const forceRefresh = raw.forceRefresh ?? false;
    const categoryIds = (raw.categoryIds || (raw.categoryId ? [raw.categoryId] : []))
      .filter((id): id is string => typeof id === "string");

    const safeHours = Math.min(Math.max(hours, 1), 168);
    const userId = session.user.id;

    // The cache key has no category dimension (Digest stores none), so a
    // filtered request must never be answered with an unfiltered digest.
    if (!forceRefresh && categoryIds.length === 0) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const cached = await prisma.digest.findFirst({
        where: {
          userId,
          date: await userTodayKey(userId),
          hours: safeHours,
          source: "web",
          createdAt: { gte: oneHourAgo },
        },
        orderBy: { createdAt: "desc" },
      });

      if (cached) {
        const structured = cached.structured as unknown[];
        const aiSettings = await prisma.aISettings.findUnique({
          where: { userId },
        });
        const language = aiSettings?.language || "en";
        const digest = formatStructuredDigest(
          structured as Parameters<typeof formatStructuredDigest>[0],
          language
        );
        return NextResponse.json({
          data: { digest, structured, cached: true, createdAt: cached.createdAt, id: cached.id },
        });
      }
    }

    const result = await generateAndStoreDigest({
      userId,
      hours: safeHours,
      source: "web",
      categoryIds,
    });

    if (!result.ok) {
      return result.reason === "no-articles"
        ? NextResponse.json(
            { error: `No articles published in the last ${safeHours} hours for this selection` },
            { status: 404 }
          )
        : NextResponse.json(
            { error: "AI API key not configured or digest generation failed" },
            { status: 503 }
          );
    }

    return NextResponse.json({
      data: {
        digest: result.html,
        structured: result.structured,
        cached: false,
        createdAt: result.createdAt,
        id: result.id,
      },
    });
  } catch (error) {
    console.error("Daily digest error:", error);
    return NextResponse.json(
      { error: "Failed to generate daily digest" },
      { status: 500 }
    );
  }
}
