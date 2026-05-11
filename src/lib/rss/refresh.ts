import { prisma } from "@/lib/prisma";
import { parseFeed } from "./parser";
import { scrapeFullText } from "./scraper";

export interface RefreshResult {
  newArticles: number;
  error?: string;
}

export async function refreshFeed(feed: {
  id: string;
  url: string;
  title: string | null;
  siteUrl: string | null;
  description: string | null;
  imageUrl: string | null;
  language: string | null;
  faviconUrl?: string | null;
  scrapeFullText: boolean;
}): Promise<RefreshResult> {
  const parsed = await parseFeed(feed.url);

  const newGuids = parsed.items
    .slice(0, 50)
    .map((item) => item.guid)
    .filter((g): g is string => !!g);

  const newUrls = parsed.items
    .slice(0, 50)
    .map((item) => item.url)
    .filter((u): u is string => !!u);

  const existingGuids = new Set<string>();
  const existingUrls = new Set<string>();

  if (newGuids.length > 0) {
    const existing = await prisma.article.findMany({
      where: { feedId: feed.id, guid: { in: newGuids } },
      select: { guid: true },
    });
    for (const a of existing) {
      if (a.guid) existingGuids.add(a.guid);
    }
  }

  if (newUrls.length > 0) {
    const existing = await prisma.article.findMany({
      where: { feedId: feed.id, url: { in: newUrls } },
      select: { url: true },
    });
    for (const a of existing) existingUrls.add(a.url);
  }

  const newItems = parsed.items.slice(0, 50).filter((item) => {
    if (item.guid && existingGuids.has(item.guid)) return false;
    if (!item.guid && existingUrls.has(item.url)) return false;
    return true;
  });

  let createdCount = 0;

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
    createdCount = result.count;
  }

  // Derive favicon URL if not already set
  let faviconUrl: string | undefined = undefined;
  if (!feed.faviconUrl) {
    try {
      const siteUrl = parsed.siteUrl || feed.siteUrl || feed.url;
      const domain = new URL(siteUrl).hostname;
      faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      // ignore URL parsing errors
    }
  }

  await prisma.feed.update({
    where: { id: feed.id },
    data: {
      title: parsed.title || feed.title || undefined,
      siteUrl: parsed.siteUrl || feed.siteUrl || undefined,
      description: parsed.description || feed.description || undefined,
      imageUrl: parsed.imageUrl || feed.imageUrl || undefined,
      language: parsed.language || feed.language || undefined,
      ...(faviconUrl ? { faviconUrl } : {}),
      lastFetched: new Date(),
      fetchError: null,
      errorCount: 0,
    },
  });

  return { newArticles: createdCount };
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let i = 0;
  async function next(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}
