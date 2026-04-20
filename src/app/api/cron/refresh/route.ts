import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseFeed } from "@/lib/rss/parser";
import { scrapeFullText } from "@/lib/rss/scraper";
import { cacheDel } from "@/lib/redis";
import { getBot } from "@/lib/telegram/bot";
import { verifyCronAuth } from "@/lib/cron-auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const feeds = await prisma.feed.findMany({
      where: { errorCount: { lt: 5 } },
      select: {
        id: true,
        url: true,
        title: true,
        siteUrl: true,
        description: true,
        imageUrl: true,
        language: true,
        scrapeFullText: true,
        refreshInterval: true,
        lastFetched: true,
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

    for (const feed of feeds) {
      if (feed.refreshInterval && feed.lastFetched) {
        const nextRefresh = new Date(feed.lastFetched.getTime() + feed.refreshInterval * 60_000);
        if (new Date() < nextRefresh) continue;
      }

      try {
        const parsed = await parseFeed(feed.url);

        const existingGuids = new Set<string>();
        if (parsed.items.length > 0) {
          const existing = await prisma.article.findMany({
            where: { feedId: feed.id },
            select: { guid: true },
          });
          for (const a of existing) {
            if (a.guid) existingGuids.add(a.guid);
          }
        }

        const newItems = parsed.items
          .slice(0, 50)
          .filter((item) => !item.guid || !existingGuids.has(item.guid));

        if (newItems.length > 0) {
          const itemsData = [];
          for (const item of newItems) {
            let content = item.content;
            if (feed.scrapeFullText && item.url) {
              const scraped = await scrapeFullText(item.url);
              if (scraped) content = scraped;
            }

            itemsData.push({
              title: item.title,
              url: item.url,
              content,
              summary: item.summary,
              author: item.author,
              imageUrl: item.imageUrl,
              publishedAt: item.publishedAt,
              guid: item.guid,
              feedId: feed.id,
              enclosureUrl: item.enclosureUrl,
              enclosureType: item.enclosureType,
              enclosureDuration: item.enclosureDuration,
            });
          }

          const result = await prisma.article.createMany({
            data: itemsData,
            skipDuplicates: true,
          });
          newArticles += result.count;
        }

        await prisma.feed.update({
          where: { id: feed.id },
          data: {
            title: parsed.title || feed.title,
            siteUrl: parsed.siteUrl || feed.siteUrl,
            description: parsed.description || feed.description,
            imageUrl: parsed.imageUrl || feed.imageUrl,
            language: parsed.language || feed.language,
            lastFetched: new Date(),
            fetchError: null,
            errorCount: 0,
          },
        });
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
    }

    if (updated > 0) await cacheDel("sidebar:*");

    console.log(
      `[Cron] Refreshed ${updated}/${feeds.length} feeds, ${newArticles} new articles, ${failed} failed`
    );

    if (newArticles > 0) {
      try {
        await checkNotificationRules(feeds.map((f: (typeof feeds)[number]) => f.id), refreshStartedAt);
      } catch (err) {
        console.error("[Cron] Notification check error:", err);
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

      if (rule.notifyTelegram && telegramSettings) {
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
            console.log(`[Notify] Telegram alert sent for rule "${rule.name}" to chat ${telegramSettings.chatId}`);
          } catch (err) {
            console.error(`[Notify] Failed to send Telegram alert to ${userId}:`, err);
          }
        }
      }
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
