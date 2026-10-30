import { prisma } from "@/lib/prisma";
import { getBot } from "@/lib/telegram/bot";
import { sendPushToUser } from "@/lib/push";

/**
 * Run the rule engine and saved-search monitors over the articles a refresh
 * just inserted. Called after every refresh (cron and manual) so articles
 * pulled in by the Refresh button get the same actions and alerts. Keyed by
 * the inserted ids, not a time window, so overlapping cron/manual runs never
 * alert twice on the same article.
 */
export async function runPostRefreshAlerts(articleIds: string[]): Promise<void> {
  if (articleIds.length === 0) return;
  try {
    await checkNotificationRules(articleIds);
  } catch (err) {
    console.error("[Refresh] Notification check error:", err);
  }
  try {
    await checkSavedSearches(articleIds);
  } catch (err) {
    console.error("[Refresh] Saved-search monitor error:", err);
  }
}

async function checkNotificationRules(articleIds: string[]) {
  const recentArticles = await prisma.article.findMany({
    where: {
      id: { in: articleIds },
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
// monitored search. Only the articles this refresh inserted are considered, so
// each match notifies exactly once.
async function checkSavedSearches(articleIds: string[]) {
  const owners = await prisma.feed.findMany({
    where: { articles: { some: { id: { in: articleIds } } } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const searches = await prisma.savedSearch.findMany({
    where: { notify: true, userId: { in: owners.map((o: { userId: string }) => o.userId) } },
  });
  if (searches.length === 0) return;

  // Cache Telegram settings + bot per user across their searches.
  const tgCache = new Map<string, Awaited<ReturnType<typeof prisma.telegramSettings.findFirst>>>();

  for (const s of searches) {
    const q = s.query.trim();
    if (!q) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      id: { in: articleIds },
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
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
