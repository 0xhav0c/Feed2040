import type { Prisma } from "@prisma/client";
import { subHours } from "date-fns";
import { prisma } from "@/lib/prisma";
import { generateDailyDigest, type StructuredDigestResult } from "@/lib/ai/summarizer";
import { formatStructuredDigest } from "@/lib/telegram/bot";
import { UNCATEGORIZED_ID } from "@/lib/article-scope";
import { dateKeyInTz, resolveTimezone } from "@/lib/timezone";

export type DigestSource = "web" | "scheduled" | "telegram";

/** The user's own timezone: briefing setting first, then the Telegram one. */
export async function getUserTimezone(userId: string): Promise<string> {
  const [ai, tg] = await Promise.all([
    prisma.aISettings.findUnique({ where: { userId }, select: { briefingTimezone: true } }),
    prisma.telegramSettings.findUnique({ where: { userId }, select: { timezone: true } }),
  ]);
  return resolveTimezone(ai?.briefingTimezone || tg?.timezone);
}

/** Digest.date for "today" in the user's timezone. */
export async function userTodayKey(userId: string): Promise<string> {
  return dateKeyInTz(await getUserTimezone(userId));
}

function categoryFilter(categoryIds?: string[]): Prisma.FeedWhereInput {
  if (!categoryIds?.length) return {};
  const real = categoryIds.filter((id) => id !== UNCATEGORIZED_ID);
  const wantsUncategorized = real.length !== categoryIds.length;
  const clauses: Prisma.FeedWhereInput[] = [];
  if (real.length) clauses.push({ categories: { some: { categoryId: { in: real } } } });
  if (wantsUncategorized) clauses.push({ categories: { none: {} } });
  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}

export type GenerateDigestResult =
  | {
      ok: true;
      id: string;
      createdAt: Date;
      structured: StructuredDigestResult[];
      html: string;
    }
  | { ok: false; reason: "no-articles" | "ai-failed" };

/**
 * Collect the user's recent articles, run the AI briefing pipeline and store
 * the result as a Digest row. Shared by the web button, the scheduler and the
 * Telegram /digest command.
 */
export async function generateAndStoreDigest(opts: {
  userId: string;
  hours: number;
  source: DigestSource;
  categoryIds?: string[];
  language?: string;
}): Promise<GenerateDigestResult> {
  const { userId, hours, source, categoryIds } = opts;

  const articles = await prisma.article.findMany({
    where: {
      // The read-it-later bucket is not news; keep it out of briefings.
      feed: { userId, isSystem: false, ...categoryFilter(categoryIds) },
      publishedAt: { gte: subHours(new Date(), hours), lte: new Date() },
    },
    orderBy: { publishedAt: "desc" },
    take: 200,
    select: {
      title: true,
      summary: true,
      aiSummary: true,
      url: true,
      feed: { select: { title: true } },
    },
  });

  if (articles.length === 0) return { ok: false, reason: "no-articles" };

  const language =
    opts.language ||
    (await prisma.aISettings.findUnique({ where: { userId }, select: { language: true } }))?.language ||
    "en";

  const results = await generateDailyDigest(
    articles.map((a: (typeof articles)[number]) => ({
      title: a.title,
      summary: a.aiSummary || a.summary,
      feedTitle: a.feed.title,
      url: a.url,
    })),
    language,
    userId
  );
  if (!results) return { ok: false, reason: "ai-failed" };

  const html = formatStructuredDigest(results, language);
  const saved = await prisma.digest.create({
    data: {
      userId,
      date: await userTodayKey(userId),
      hours,
      source,
      structured: results as unknown as Prisma.InputJsonValue,
      htmlDigest: html,
    },
  });

  return { ok: true, id: saved.id, createdAt: saved.createdAt, structured: results, html };
}
