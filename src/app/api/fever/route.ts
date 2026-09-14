import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import crypto from "crypto";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

async function authenticateApiKey(apiKey: string) {
  if (!apiKey) return null;
  const user = await prisma.user.findFirst({
    where: { feverApiKey: apiKey },
    select: { id: true, username: true },
  });
  return user;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);

  // Rate-limit per IP to prevent unauthenticated brute-force/DoS against the
  // unsalted-key lookup (the endpoint is public and CSRF-exempt).
  const rl = await checkRateLimit(`fever:${clientIp(req)}`, 60, 60);
  if (!rl.allowed) {
    return json({ api_version: 3, auth: 0 }, 429);
  }

  // Fever clients send parameters as a form body, but some (e.g. Readrops)
  // issue GET requests or bodyless/JSON POSTs for certain calls. Parsing the
  // body unconditionally throws when there is no form-encoded body, so guard it
  // and fall back to query-string params, which Fever also permits.
  let formData: FormData | null = null;
  const contentType = req.headers.get("content-type") || "";
  if (
    req.method !== "GET" &&
    (contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded"))
  ) {
    try {
      formData = await req.formData();
    } catch {
      formData = null;
    }
  }

  const param = (name: string): string =>
    (formData?.get(name) as string | null) ?? url.searchParams.get(name) ?? "";

  const apiKey = param("api_key");

  const user = await authenticateApiKey(apiKey);
  const authOk = !!user;

  if (url.searchParams.has("api")) {
    return json({ api_version: 3, auth: authOk ? 1 : 0 });
  }

  if (!authOk || !user) {
    return json({ api_version: 3, auth: 0 });
  }

  const base = { api_version: 3, auth: 1, last_refreshed_on_time: Math.floor(Date.now() / 1000) };

  if (url.searchParams.has("feeds")) {
    const feeds = await prisma.feed.findMany({
      where: { userId: user.id },
      select: { id: true, title: true, url: true, siteUrl: true, lastFetched: true },
    });

    const feedGroups = await prisma.feedCategory.findMany({
      where: { feed: { userId: user.id } },
      select: { feedId: true, categoryId: true },
    });

    return json({
      ...base,
      feeds: feeds.map((f) => ({
        id: hashId(f.id),
        favicon_id: hashId(f.id),
        title: f.title,
        url: f.url,
        site_url: f.siteUrl || f.url,
        is_spark: 0,
        last_updated_on_time: f.lastFetched ? Math.floor(f.lastFetched.getTime() / 1000) : 0,
      })),
      feeds_groups: groupFeeds(feedGroups),
    });
  }

  if (url.searchParams.has("groups")) {
    const categories = await prisma.category.findMany({
      where: { userId: user.id },
      select: { id: true, name: true },
    });

    const feedGroups = await prisma.feedCategory.findMany({
      where: { feed: { userId: user.id } },
      select: { feedId: true, categoryId: true },
    });

    return json({
      ...base,
      groups: categories.map((c) => ({ id: hashId(c.id), title: c.name })),
      feeds_groups: groupFeeds(feedGroups),
    });
  }

  if (url.searchParams.has("favicons")) {
    const feeds = await prisma.feed.findMany({
      where: { userId: user.id },
      select: { id: true },
    });

    return json({
      ...base,
      favicons: feeds.map((f) => ({
        id: hashId(f.id),
        data: "image/gif;base64,R0lGODlhAQABAIAAAObm5gAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
      })),
    });
  }

  if (url.searchParams.has("items")) {
    const sinceId = parseInt(url.searchParams.get("since_id") || "0", 10);
    const maxIdRaw = url.searchParams.get("max_id");
    const withIds = url.searchParams.get("with_ids");

    const articleSelect = {
      id: true, seq: true, title: true, url: true, author: true, content: true,
      publishedAt: true, createdAt: true, feedId: true,
    } as const;

    // Item ids are the article's monotonic "seq". Fever pagination:
    //   since_id → items with seq GREATER THAN since_id (ascending)
    //   max_id   → items with seq LESS THAN max_id (descending)
    //   with_ids → the specific seqs requested
    let articles;
    if (withIds) {
      const ids = withIds.split(",").map((i) => parseInt(i.trim(), 10)).filter((n) => !isNaN(n));
      articles = await prisma.article.findMany({
        where: { feed: { userId: user.id }, seq: { in: ids } },
        select: articleSelect,
        orderBy: { seq: "asc" },
      });
    } else if (maxIdRaw) {
      const maxId = parseInt(maxIdRaw, 10);
      articles = await prisma.article.findMany({
        where: { feed: { userId: user.id }, seq: { lt: maxId } },
        select: articleSelect,
        orderBy: { seq: "desc" },
        take: 50,
      });
    } else {
      articles = await prisma.article.findMany({
        where: { feed: { userId: user.id }, seq: { gt: sinceId } },
        select: articleSelect,
        orderBy: { seq: "asc" },
        take: 50,
      });
    }

    const [readRecords, bookmarkRecords] = await Promise.all([
      prisma.readArticle.findMany({
        where: { userId: user.id, articleId: { in: articles.map((a) => a.id) } },
        select: { articleId: true },
      }),
      prisma.bookmark.findMany({
        where: { userId: user.id, articleId: { in: articles.map((a) => a.id) } },
        select: { articleId: true },
      }),
    ]);

    const readSet = new Set(readRecords.map((r) => r.articleId));
    const bookmarkSet = new Set(bookmarkRecords.map((b) => b.articleId));

    return json({
      ...base,
      items: articles.map((a) => ({
        id: a.seq,
        feed_id: hashId(a.feedId),
        title: a.title,
        author: a.author || "",
        html: a.content || "",
        url: a.url,
        is_saved: bookmarkSet.has(a.id) ? 1 : 0,
        is_read: readSet.has(a.id) ? 1 : 0,
        created_on_time: Math.floor((a.publishedAt || a.createdAt).getTime() / 1000),
      })),
      total_items: articles.length,
    });
  }

  if (url.searchParams.has("unread_item_ids")) {
    const unread = await prisma.article.findMany({
      where: {
        feed: { userId: user.id },
        readArticles: { none: { userId: user.id } },
      },
      select: { seq: true },
      orderBy: { seq: "asc" },
    });

    return json({ ...base, unread_item_ids: unread.map((a) => a.seq).join(",") });
  }

  if (url.searchParams.has("saved_item_ids")) {
    const saved = await prisma.article.findMany({
      where: {
        feed: { userId: user.id },
        bookmarks: { some: { userId: user.id } },
      },
      select: { seq: true },
      orderBy: { seq: "asc" },
    });

    return json({
      ...base,
      saved_item_ids: saved.map((a) => a.seq).join(","),
    });
  }

  const mark = url.searchParams.get("mark");
  const asParam = param("as");
  const id = param("id");

  if (mark && asParam && id) {
    const numericId = parseInt(id, 10);

    if (mark === "item") {
      // Item ids are the article's "seq"; look it up directly.
      const article = await prisma.article.findFirst({
        where: { seq: numericId, feed: { userId: user.id } },
        select: { id: true },
      });

      if (article) {
        if (asParam === "read") {
          await prisma.readArticle.upsert({
            where: { userId_articleId: { userId: user.id, articleId: article.id } },
            create: { userId: user.id, articleId: article.id },
            update: {},
          });
        } else if (asParam === "unread") {
          await prisma.readArticle.deleteMany({
            where: { userId: user.id, articleId: article.id },
          });
        } else if (asParam === "saved") {
          await prisma.bookmark.upsert({
            where: { userId_articleId: { userId: user.id, articleId: article.id } },
            create: { userId: user.id, articleId: article.id },
            update: {},
          });
        } else if (asParam === "unsaved") {
          await prisma.bookmark.deleteMany({
            where: { userId: user.id, articleId: article.id },
          });
        }
      }
    } else if (mark === "feed" && asParam === "read") {
      const feeds = await prisma.feed.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      const feed = feeds.find((f) => hashId(f.id) === numericId);

      if (feed) {
        const beforeStr = param("before");
        const before = beforeStr ? new Date(parseInt(beforeStr, 10) * 1000) : new Date();

        const articles = await prisma.article.findMany({
          where: { feedId: feed.id, createdAt: { lte: before } },
          select: { id: true },
        });

        if (articles.length > 0) {
          await prisma.readArticle.createMany({
            data: articles.map((a) => ({ userId: user.id, articleId: a.id })),
            skipDuplicates: true,
          });
        }
      }
    } else if (mark === "group" && asParam === "read") {
      const categories = await prisma.category.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      const category = categories.find((c) => hashId(c.id) === numericId);

      if (category) {
        const beforeStr = param("before");
        const before = beforeStr ? new Date(parseInt(beforeStr, 10) * 1000) : new Date();

        const articles = await prisma.article.findMany({
          where: {
            feed: { categories: { some: { categoryId: category.id } } },
            createdAt: { lte: before },
          },
          select: { id: true },
        });

        if (articles.length > 0) {
          await prisma.readArticle.createMany({
            data: articles.map((a) => ({ userId: user.id, articleId: a.id })),
            skipDuplicates: true,
          });
        }
      }
    }

    return json(base);
  }

  return json(base);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}

function hashId(cuid: string): number {
  const hash = crypto.createHash("md5").update(cuid).digest();
  // Mask to 31 bits (positive signed 32-bit range, max 2147483647). Fever
  // clients like Readrops parse ids as signed ints; an unsigned value above
  // 2^31-1 overflows their parser ("expected an int but 2582293886").
  return (hash.readUInt32BE(0) ^ hash.readUInt32BE(4) ^ hash.readUInt32BE(8) ^ hash.readUInt32BE(12)) & 0x7fffffff;
}

function groupFeeds(feedCategories: { feedId: string; categoryId: string }[]) {
  const groups = new Map<string, number[]>();
  for (const fc of feedCategories) {
    const gid = hashId(fc.categoryId);
    if (!groups.has(String(gid))) {
      groups.set(String(gid), []);
    }
    groups.get(String(gid))!.push(hashId(fc.feedId));
  }
  return Array.from(groups.entries()).map(([gid, fids]) => ({
    group_id: parseInt(gid, 10),
    feed_ids: fids.join(","),
  }));
}
