import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
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
  const formData = await req.formData();
  const apiKey = (formData.get("api_key") as string) || "";

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
      select: { id: true, faviconUrl: true },
    });

    return json({
      ...base,
      favicons: feeds.map((f) => ({
        id: hashId(f.id),
        data: f.faviconUrl
          ? `image/png;base64,`
          : "image/gif;base64,R0lGODlhAQABAIAAAObm5gAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
      })),
    });
  }

  if (url.searchParams.has("items")) {
    const sinceId = parseInt(url.searchParams.get("since_id") || "0", 10);
    const maxId = url.searchParams.get("max_id");
    const withIds = url.searchParams.get("with_ids");

    let articles;
    if (withIds) {
      const ids = withIds.split(",").map((i) => parseInt(i.trim(), 10));
      const allArticles = await prisma.article.findMany({
        where: { feed: { userId: user.id } },
        select: { id: true, title: true, url: true, author: true, content: true, publishedAt: true, createdAt: true, feedId: true },
        orderBy: { createdAt: "desc" },
        take: 10000,
      });
      articles = allArticles.filter((a) => ids.includes(hashId(a.id)));
    } else {
      const allArticles = await prisma.article.findMany({
        where: { feed: { userId: user.id } },
        select: { id: true, title: true, url: true, author: true, content: true, publishedAt: true, createdAt: true, feedId: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      articles = allArticles.filter((a) => {
        const numId = hashId(a.id);
        if (sinceId && numId <= sinceId) return false;
        if (maxId && numId >= parseInt(maxId, 10)) return false;
        return true;
      });
    }

    const readSet = new Set(
      (await prisma.readArticle.findMany({
        where: { userId: user.id },
        select: { articleId: true },
      })).map((r) => r.articleId)
    );

    const bookmarkSet = new Set(
      (await prisma.bookmark.findMany({
        where: { userId: user.id },
        select: { articleId: true },
      })).map((b) => b.articleId)
    );

    return json({
      ...base,
      items: articles.map((a) => ({
        id: hashId(a.id),
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
    const readIds = new Set(
      (await prisma.readArticle.findMany({
        where: { userId: user.id },
        select: { articleId: true },
      })).map((r) => r.articleId)
    );

    const allArticles = await prisma.article.findMany({
      where: { feed: { userId: user.id } },
      select: { id: true },
    });

    const unreadIds = allArticles
      .filter((a) => !readIds.has(a.id))
      .map((a) => hashId(a.id));

    return json({ ...base, unread_item_ids: unreadIds.join(",") });
  }

  if (url.searchParams.has("saved_item_ids")) {
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: user.id },
      select: { articleId: true },
    });

    return json({
      ...base,
      saved_item_ids: bookmarks.map((b) => hashId(b.articleId)).join(","),
    });
  }

  const mark = url.searchParams.get("mark");
  const asParam = formData.get("as") as string;
  const id = formData.get("id") as string;

  if (mark && asParam && id) {
    const numericId = parseInt(id, 10);

    if (mark === "item") {
      const allArticles = await prisma.article.findMany({
        where: { feed: { userId: user.id } },
        select: { id: true },
      });
      const article = allArticles.find((a) => hashId(a.id) === numericId);

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
        const beforeStr = formData.get("before") as string;
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
        const beforeStr = formData.get("before") as string;
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
  return hash.readUInt32BE(0);
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
