import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDailyDigest } from "@/lib/ai/summarizer";
import { formatStructuredDigest } from "@/lib/telegram/bot";
import { subHours, format } from "date-fns";

function todayKey(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayKey();

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

  try {
    const body = await req.json().catch(() => ({}));
    const raw = body as {
      categoryIds?: string[];
      categoryId?: string;
      hours?: number;
      forceRefresh?: boolean;
    };
    const hours = raw.hours ?? 24;
    const forceRefresh = raw.forceRefresh ?? false;
    const categoryIds = raw.categoryIds || (raw.categoryId ? [raw.categoryId] : undefined);

    const safeHours = Math.min(Math.max(hours, 1), 168);
    const date = todayKey();

    if (!forceRefresh) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const cached = await prisma.digest.findFirst({
        where: {
          userId: session.user.id,
          date,
          hours: safeHours,
          source: "web",
          createdAt: { gte: oneHourAgo },
        },
        orderBy: { createdAt: "desc" },
      });

      if (cached) {
        const structured = cached.structured as unknown[];
        const aiSettings = await prisma.aISettings.findUnique({
          where: { userId: session.user.id },
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

    const since = subHours(new Date(), safeHours);

    const whereClause = {
      feed: {
        userId: session.user.id,
        ...(categoryIds?.length
          ? {
              categories: {
                some: { categoryId: { in: categoryIds } },
              },
            }
          : {}),
      },
      publishedAt: { gte: since },
    };

    const articles = await prisma.article.findMany({
      where: whereClause,
      orderBy: { publishedAt: "desc" },
      take: 200,
      include: { feed: { select: { title: true } } },
    });

    const digestArticles = articles.map((a: { title: string; aiSummary: string | null; summary: string | null; feed: { title: string }; url: string }) => ({
      title: a.title,
      summary: a.aiSummary || a.summary,
      feedTitle: a.feed.title,
      url: a.url,
    }));

    const aiSettings = await prisma.aISettings.findUnique({
      where: { userId: session.user.id },
    });
    const language = aiSettings?.language || "en";

    const results = await generateDailyDigest(
      digestArticles,
      language,
      session.user.id
    );

    if (!results) {
      return NextResponse.json(
        { error: "AI API key not configured or digest generation failed" },
        { status: 503 }
      );
    }

    const digest = formatStructuredDigest(results, language);

    const saved = await prisma.digest.create({
      data: {
        userId: session.user.id,
        date,
        hours: safeHours,
        source: "web",
        structured: results as unknown as Parameters<typeof prisma.digest.create>[0]["data"]["structured"],
        htmlDigest: digest,
      },
    });

    return NextResponse.json({
      data: { digest, structured: results, cached: false, createdAt: saved.createdAt, id: saved.id },
    });
  } catch (error) {
    console.error("Daily digest error:", error);
    return NextResponse.json(
      { error: "Failed to generate daily digest" },
      { status: 500 }
    );
  }
}
