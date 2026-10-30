import { prisma } from "@/lib/prisma";
import { parseFeed, type ParsedFeedItem } from "./parser";
import { getAppSetting } from "@/lib/settings";
import { scrapeFullText } from "./scraper";

export interface RefreshResult {
  newArticles: number;
  error?: string;
}

// Retention cutoff, cached briefly: refresh runs per feed, hundreds per cycle.
let retentionCache: { value: Date | null; at: number } | null = null;

async function retentionCutoff(): Promise<Date | null> {
  if (retentionCache && Date.now() - retentionCache.at < 60_000) return retentionCache.value;
  const days = parseInt((await getAppSetting("retentionDays")) || "0", 10);
  const value = days > 0 ? new Date(Date.now() - days * 86_400_000) : null;
  retentionCache = { value, at: Date.now() };
  return value;
}

/**
 * Insert the not-yet-stored items of a parsed feed. Shared by refresh and by
 * the add/import paths so they dedup, map fields (incl. podcast enclosures)
 * and tolerate duplicate guids the same way.
 */
export async function storeNewItems(
  feedId: string,
  items: ParsedFeedItem[],
  opts: { scrapeFullText?: boolean } = {}
): Promise<number> {
  const candidates = items.slice(0, 50);

  // Items older than the retention window would be deleted by the cleanup job
  // and then re-inserted as "new" on the next refresh, forever.
  const cutoff = await retentionCutoff();
  const fresh = cutoff
    ? candidates.filter((item) => !item.publishedAt || item.publishedAt >= cutoff)
    : candidates;

  const newGuids = fresh.map((item) => item.guid).filter((g): g is string => !!g);
  const newUrls = fresh.map((item) => item.url).filter((u): u is string => !!u);

  const existingGuids = new Set<string>();
  const existingUrlTitles = new Set<string>();

  if (newGuids.length > 0) {
    const existing = await prisma.article.findMany({
      where: { feedId, guid: { in: newGuids } },
      select: { guid: true },
    });
    for (const a of existing) {
      if (a.guid) existingGuids.add(a.guid);
    }
  }

  if (newUrls.length > 0) {
    const existing = await prisma.article.findMany({
      where: { feedId, url: { in: newUrls } },
      select: { url: true, title: true },
    });
    for (const a of existing) existingUrlTitles.add(`${a.url}\n${a.title}`);
  }

  const seen = new Set<string>();
  const newItems = fresh.filter((item) => {
    if (item.guid && existingGuids.has(item.guid)) return false;
    // Also dedup by URL+title even when a guid is present: some feeds emit an
    // unstable guid (e.g. a random ?p=NNNN) for the same article on every
    // fetch. The title is part of the key because other feeds (podcasts,
    // changelogs) point every distinct item at the same page.
    if (item.url) {
      const key = `${item.url}\n${item.title}`;
      if (existingUrlTitles.has(key) || seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });

  if (newItems.length === 0) return 0;

  const itemsData = [];
  for (const item of newItems) {
    let content = item.content;
    if (opts.scrapeFullText && item.url) {
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
      feedId,
      enclosureUrl: item.enclosureUrl,
      enclosureType: item.enclosureType,
      enclosureDuration: item.enclosureDuration,
    });
  }

  const result = await prisma.article.createMany({
    data: itemsData,
    skipDuplicates: true,
  });
  return result.count;
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
  const createdCount = await storeNewItems(feed.id, parsed.items, {
    scrapeFullText: feed.scrapeFullText,
  });

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
      // Keep a title the user (or their OPML) set; only fill in a missing
      // one or replace the URL placeholder used when a feed has no title.
      title: !feed.title || feed.title === feed.url ? parsed.title || undefined : undefined,
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
