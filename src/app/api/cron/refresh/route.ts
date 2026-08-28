import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cacheDel } from "@/lib/redis";
import { getBot } from "@/lib/telegram/bot";
import { verifyCronAuth } from "@/lib/cron-auth";
import { refreshFeed, runWithConcurrency } from "@/lib/rss/refresh";
import { sendPushToUser } from "@/lib/push";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const feeds = await prisma.feed.findMany({
      where: { isSystem: false },
      select: {
        id: true,
        url: true,
        title: true,
        siteUrl: true,
        description: true,
        imageUrl: true,
        language: true,
        faviconUrl: true,
        scrapeFullText: true,
        refreshInterval: true,
        lastFetched: true,
        errorCount: true,
        updatedAt: true,
        userId: true,
      },
      orderBy: [
        { lastFetched: { sort: "asc", nulls: "first" } },
        { updatedAt: "asc" },
      ],
    });

    let newArticles = 0;
    let updated = 0;
    let failed = 0;
    const refreshStartedAt = new Date();
    const now = Date.now();
    const feedsToRefresh = feeds.filter((feed) => {
      // Regular per-feed cadence
      if (feed.refreshInterval && feed.lastFetched) {
        const nextRefresh = feed.lastFetched.getTime() + feed.refreshInterval * 60_000;
        if (now < nextRefresh) return false;
      }
      // Exponential backoff for repeatedly failing feeds (never permanently excluded).
      // A transient outage no longer kills feeds forever: they keep retrying, just
      // less often (capped at once every 12h), and errorCount resets to 0 on success.
      // Uses updatedAt (bumped on every attempt, success or fail) as the last-attempt
      // marker, since lastFetched only advances on success.
      if (feed.errorCount > 0) {
        const backoffMs = Math.min(30 * 2 ** (feed.errorCount - 1), 720) * 60_000;
        if (now < feed.updatedAt.getTime() + backoffMs) return false;
      }
      return true;
    });

    await runWithConcurrency(feedsToRefresh, 5, async (feed) => {
      try {
        const result = await refreshFeed(feed);
        newArticles += result.newArticles;
        updated++;
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const shortTitle = feed.title?.slice(0, 30) || feed.url.slice(0, 40);
        console.error(`[Cron] Feed failed: "${shortTitle}" — ${errorMsg}`);
        await prisma.feed.update({
          where: { id: feed.id },
          data: {
            fetchError: errorMsg,
            errorCount: { increment: 1 },
          },
        });
      }
    });

    if (updated > 0) await cacheDel("sidebar:*");

    console.log(
      `[Cron] Refreshed ${updated}/${feedsToRefresh.length} feeds, ${newArticles} new articles, ${failed} failed`
    );

    if (newArticles > 0) {
      try {
        await checkNotificationRules(feedsToRefresh.map((f) => f.id), refreshStartedAt);
      } catch (err) {
        console.error("[Cron] Notification check error:", err);
      }
      try {
        await checkSavedSearches(refreshStartedAt);
      } catch (err) {
        console.error("[Cron] Saved-search monitor error:", err);
      }
    }

    return NextResponse.json({
      data: { totalFeeds: feeds.length, updated, failed, newArticles },
    });
  } catch (error) {
    console.error("Cron refresh error:", error);
    return NextResponse.json(
      { error: "Failed to refresh feeds" },
      { status: 500 }
    );
  }
}

async function checkNotificationRules(feedIds: string[], since: Date) {
  const recentArticles = await prisma.article.findMany({
    where: {
      feedId: { in: feedIds },
      createdAt: { gte: since },
    },
    select: { id: true, title: true, url: true, summary: true, feed: { select: { userId: true } } },
  });
  if (recentArticles.length === 0) return;

  const userArticles = new Map<string, typeof recentArticles>();
  for (const art of recentArticles) {
    const uid = art.feed.userId;
    if (!userArticles.has(uid)) userArticles.set(uid, []);
    userArticles.get(uid)!.push(art);
  }

  for (const [userId, articles] of userArticles) {
    const rules = await prisma.notificationRule.findMany({
      where: { userId, isActive: true },
    });
    if (rules.length === 0) continue;

    const telegramSettings = await prisma.telegramSettings.findFirst({
      where: { userId, isActive: true },
    });

    for (const rule of rules) {
      const matched = articles.filter((art: (typeof recentArticles)[number]) => {
        const text = `${art.title} ${art.summary || ""}`.toLowerCase();
        return rule.keywords.some((kw: string) => text.includes(kw.toLowerCase()));
      });

      if (matched.length === 0) continue;
      console.log(`[Notify] Rule "${rule.name}" matched ${matched.length} article(s) for user ${userId}`);

      // Apply automatic actions (rule engine v1) on matching new articles.
      const matchedIds = matched.map((a: (typeof recentArticles)[number]) => a.id);
      try {
        if (rule.actions?.includes("markRead")) {
          await prisma.readArticle.createMany({
            data: matchedIds.map((articleId: string) => ({ userId, articleId })),
            skipDuplicates: true,
          });
        }
        if (rule.actions?.includes("star")) {
          await prisma.bookmark.createMany({
            data: matchedIds.map((articleId: string) => ({ userId, articleId })),
            skipDuplicates: true,
          });
        }
        if (rule.actions?.includes("tag") && rule.tagName) {
          const tag = await prisma.tag.upsert({
            where: { userId_name: { userId, name: rule.tagName } },
            create: { userId, name: rule.tagName },
            update: {},
            select: { id: true },
          });
          await prisma.articleTag.createMany({
            data: matchedIds.map((articleId: string) => ({ articleId, tagId: tag.id })),
            skipDuplicates: true,
          });
        }
      } catch (err) {
        console.error(`[Rule] Failed to apply actions for "${rule.name}":`, err);
      }

      if (rule.notifyTelegram) {
        if (telegramSettings) {
          const bot = await getBot(userId);
          if (bot) {
            const lines = [
              `🔔 <b>Alert: ${escapeHtml(rule.name)}</b>`,
              `${matched.length} matching article${matched.length > 1 ? "s" : ""} found:`,
              "",
              ...matched.slice(0, 5).map(
                (a: (typeof recentArticles)[number]) => `• <a href="${escapeHtml(a.url)}">${escapeHtml(a.title)}</a>`
              ),
            ];
            if (matched.length > 5) lines.push(`... and ${matched.length - 5} more`);

            try {
              await bot.telegram.sendMessage(telegramSettings.chatId, lines.join("\n"), {
                parse_mode: "HTML",
                // @ts-expect-error Telegraf typing quirk
                disable_web_page_preview: true,
              });
            } catch (err) {
              console.error(`[Notify] Failed to send Telegram alert to ${userId}:`, err);
            }
          }
        }

        try {
          await sendPushToUser(userId, {
            title: `Alert: ${rule.name}`,
            body: `${matched.length} matching article${matched.length > 1 ? "s" : ""}: ${matched[0].title}`,
            url: "/feeds",
          });
        } catch (err) {
          console.error(`[Notify] Failed to send push to ${userId}:`, err);
        }
      }
    }
  }
}

// Saved-search monitoring: alert (Telegram) when new articles match a user's
// monitored search. Only new articles (createdAt >= since) are considered, so
// each match notifies exactly once.
async function checkSavedSearches(since: Date) {
  const searches = await prisma.savedSearch.findMany({ where: { notify: true } });
  if (searches.length === 0) return;

  // Cache Telegram settings + bot per user across their searches.
  const tgCache = new Map<string, Awaited<ReturnType<typeof prisma.telegramSettings.findFirst>>>();

  for (const s of searches) {
    const q = s.query.trim();
    if (!q) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      createdAt: { gte: since },
      feed: { userId: s.userId, isSystem: false },
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ],
    };
    if (s.feedId) where.feedId = s.feedId;
    if (s.categoryId) where.feed = { ...where.feed, categories: { some: { categoryId: s.categoryId } } };

    const matched = await prisma.article.findMany({
      where,
      select: { title: true, url: true },
      take: 20,
    });
    if (matched.length === 0) continue;
    console.log(`[Monitor] Search "${s.name}" matched ${matched.length} new article(s) for user ${s.userId}`);

    // Telegram (only if configured for this user).
    if (!tgCache.has(s.userId)) {
      tgCache.set(
        s.userId,
        await prisma.telegramSettings.findFirst({ where: { userId: s.userId, isActive: true } })
      );
    }
    const telegramSettings = tgCache.get(s.userId);
    if (telegramSettings) {
      const bot = await getBot(s.userId);
      if (bot) {
        const lines = [
          `🔎 <b>Saved search: ${escapeHtml(s.name)}</b>`,
          `${matched.length} new match${matched.length > 1 ? "es" : ""}:`,
          "",
          ...matched.slice(0, 5).map((a) => `• <a href="${escapeHtml(a.url)}">${escapeHtml(a.title)}</a>`),
        ];
        if (matched.length > 5) lines.push(`... and ${matched.length - 5} more`);
        try {
          await bot.telegram.sendMessage(telegramSettings.chatId, lines.join("\n"), {
            parse_mode: "HTML",
            // @ts-expect-error Telegraf typing quirk
            disable_web_page_preview: true,
          });
        } catch (err) {
          console.error(`[Monitor] Failed to send Telegram alert to ${s.userId}:`, err);
        }
      }
    }

    // Web push (independent of Telegram).
    try {
      await sendPushToUser(s.userId, {
        title: `Saved search: ${s.name}`,
        body: `${matched.length} new match${matched.length > 1 ? "es" : ""}: ${matched[0].title}`,
        url: searchLink(s),
      });
    } catch (err) {
      console.error(`[Monitor] Failed to send push to ${s.userId}:`, err);
    }
  }
}

// Rebuild the in-app link for a saved search so a push click lands on results.
function searchLink(s: { query: string; feedId: string | null; categoryId: string | null; filter: string | null }): string {
  const p = new URLSearchParams();
  p.set("q", s.query);
  if (s.feedId) p.set("feedId", s.feedId);
  if (s.categoryId) p.set("categoryId", s.categoryId);
  if (s.filter) p.set("filter", s.filter);
  return `/feeds?${p.toString()}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
