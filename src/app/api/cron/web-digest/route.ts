import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDailyDigest } from "@/lib/ai/summarizer";
import { formatStructuredDigest } from "@/lib/telegram/bot";
import { subHours, format } from "date-fns";
import { verifyCronAuth } from "@/lib/cron-auth";

const inProgressUsers = new Set<string>();

function todayKey(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function getLocalTimeString(date: Date, timezone: string): string {
  try {
    return date.toLocaleString("en-CA", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    const h = date.getUTCHours().toString().padStart(2, "0");
    const m = date.getUTCMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isWithinWindow(current: string, target: string, windowMinutes = 2): boolean {
  const diff = Math.abs(timeToMinutes(current) - timeToMinutes(target));
  return diff <= windowMinutes || diff >= 1440 - windowMinutes;
}

function hasTimePassed(current: string, target: string): boolean {
  return timeToMinutes(current) > timeToMinutes(target);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await prisma.aISettings.findMany({
      where: { briefingEnabled: true },
      include: { user: true },
    });

    const now = new Date();
    let generated = 0;
    let skipped = 0;

    for (const settings of users) {
      if (!settings.briefingTimes?.length) continue;

      if (inProgressUsers.has(settings.userId)) {
        skipped++;
        continue;
      }

      const tz = settings.briefingTimezone || "Europe/Istanbul";
      const currentTimeStr = getLocalTimeString(now, tz);

      const date = todayKey();
      const hours = settings.briefingHours || 24;

      const existingCount = await prisma.digest.count({
        where: {
          userId: settings.userId,
          date,
          source: "scheduled",
        },
      });

      if (existingCount > 0) {
        skipped++;
        continue;
      }

      const exactMatch = settings.briefingTimes.some((t: string) =>
        isWithinWindow(currentTimeStr, t)
      );

      const catchUp = !exactMatch && settings.briefingTimes.some((t: string) =>
        hasTimePassed(currentTimeStr, t)
      );

      if (!exactMatch && !catchUp) continue;

      if (inProgressUsers.has(settings.userId)) {
        skipped++;
        continue;
      }

      inProgressUsers.add(settings.userId);

      try {
        const since = subHours(new Date(), hours);
        const categoryIds = settings.briefingCategories?.length
          ? settings.briefingCategories
          : undefined;

        const whereClause = {
          feed: {
            userId: settings.userId,
            ...(categoryIds?.length
              ? { categories: { some: { categoryId: { in: categoryIds } } } }
              : {}),
          },
          publishedAt: { gte: since },
        };

        const articles = await prisma.article.findMany({
          where: whereClause,
          orderBy: { publishedAt: "desc" as const },
          take: 200,
          include: { feed: { select: { title: true } } },
        });

        if (articles.length === 0) {
          skipped++;
          continue;
        }

        const digestArticles = articles.map((a: (typeof articles)[number]) => ({
          title: a.title,
          summary: a.aiSummary || a.summary,
          feedTitle: a.feed.title,
          url: a.url,
        }));

        const language = settings.language || "en";

        console.log(`[WebDigest] Generating for user ${settings.userId}${catchUp ? " (catch-up)" : ""}, language=${language}, articles=${articles.length}`);

        const results = await generateDailyDigest(
          digestArticles,
          language,
          settings.userId
        );

        if (!results) {
          skipped++;
          continue;
        }

        const html = formatStructuredDigest(results, language);

        await prisma.digest.create({
          data: {
            userId: settings.userId,
            date,
            hours,
            source: "scheduled",
            structured: results as unknown as Parameters<typeof prisma.digest.create>[0]["data"]["structured"],
            htmlDigest: html,
          },
        });

        console.log(`[WebDigest] Generated for user ${settings.userId}: ${results[0]?.items?.length || 0} items`);
        generated++;
      } finally {
        inProgressUsers.delete(settings.userId);
      }
    }

    return NextResponse.json({
      data: { generated, skipped, total: users.length },
    });
  } catch (error) {
    console.error("Cron web-digest error:", error);
    return NextResponse.json(
      { error: "Failed to run web-digest cron" },
      { status: 500 }
    );
  }
}
