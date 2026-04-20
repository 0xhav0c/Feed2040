import Parser from "rss-parser";
import { validateFeedUrl } from "@/lib/utils/url-validator";
import { cleanTrackingParams } from "@/lib/utils/url-cleaner";

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent": "Feed2040/1.0 RSS Reader",
  },
  customFields: {
    item: [["media:content", "mediaContent"]],
  },
});

export type ParsedFeed = {
  title: string;
  description: string | null;
  siteUrl: string | null;
  imageUrl: string | null;
  language: string | null;
  items: ParsedFeedItem[];
};

export type ParsedFeedItem = {
  title: string;
  url: string;
  content: string | null;
  summary: string | null;
  author: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
  guid: string | null;
  enclosureUrl: string | null;
  enclosureType: string | null;
  enclosureDuration: string | null;
};

function extractImage(item: Record<string, unknown>): string | null {
  // Try media:content
  const mc = item.mediaContent as Record<string, unknown> | undefined;
  if (mc) {
    const attrs = mc.$ as Record<string, string> | undefined;
    if (attrs?.url) return attrs.url;
  }

  // Try enclosure
  const enc = item.enclosure as Record<string, string> | undefined;
  if (enc?.url && enc.type?.startsWith("image")) return enc.url;

  // Try extracting from content
  const content = (item.content || item["content:encoded"]) as string | undefined;
  if (content) {
    const match = content.match(/<img[^>]+src="([^"]+)"/);
    if (match) return match[1];
  }

  return null;
}

const MAX_CONTENT_LENGTH = 100_000;

function str(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "_" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)._);
  }
  if (value != null) return String(value);
  return undefined;
}

export async function parseFeed(url: string): Promise<ParsedFeed> {
  const validation = validateFeedUrl(url);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid feed URL");
  }
  const feed = await parser.parseURL(url);

  return {
    title: str(feed.title) || url,
    description: str(feed.description) || null,
    siteUrl: str(feed.link) || null,
    imageUrl: str(feed.image?.url) || null,
    language: str(feed.language) || null,
    items: (feed.items || []).map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      let content = str(raw["content:encoded"]) || str(item.content) || null;
      if (content && content.length > MAX_CONTENT_LENGTH) {
        content = content.slice(0, MAX_CONTENT_LENGTH);
      }
      const enc = raw.enclosure as Record<string, string> | undefined;
      const encUrl = enc?.url || null;
      const encType = enc?.type || null;
      const encDuration = enc?.length || null;

      return {
        title: str(item.title) || "Untitled",
        url: cleanTrackingParams(str(item.link) || ""),
        content,
        summary: str(item.contentSnippet)?.slice(0, 500) || null,
        author: str(item.creator) || str(raw.author) || null,
        imageUrl: extractImage(raw),
        publishedAt: item.isoDate ? new Date(item.isoDate) : null,
        guid: str(raw.guid) || str(raw.id) || str(item.link) || null,
        enclosureUrl: encUrl,
        enclosureType: encType,
        enclosureDuration: encDuration,
      };
    }),
  };
}

export async function previewFeed(url: string): Promise<ParsedFeed & { itemCount: number }> {
  const feed = await parseFeed(url);
  return {
    ...feed,
    itemCount: feed.items.length,
    items: feed.items.slice(0, 5),
  };
}
