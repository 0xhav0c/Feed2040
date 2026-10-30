import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseOpml, generateOpml, flattenOpmlFeeds } from "@/lib/rss/opml";
import { parseFeed } from "@/lib/rss/parser";
import { storeNewItems } from "@/lib/rss/refresh";
import { findOrCreateCategory } from "@/lib/categories";
import { cacheDel } from "@/lib/redis";
import { validateFeedUrl } from "@/lib/utils/url-validator";

// POST /api/opml - Import
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "OPML file is required" }, { status: 400 });
    }

    const xmlContent = await file.text();
    const opmlDoc = await parseOpml(xmlContent);
    const feeds = flattenOpmlFeeds(opmlDoc.outlines);

    let imported = 0, skipped = 0, failed = 0;

    for (const feedData of feeds) {
      try {
        // Feeds without a folder stay uncategorized (as the streaming import
        // does) instead of getting a real "Uncategorized" category.
        const categoryId =
          feedData.category && feedData.category !== "Uncategorized"
            ? await findOrCreateCategory(session.user.id, feedData.category)
            : null;

        const existing = await prisma.feed.findUnique({
          where: { url_userId: { url: feedData.url, userId: session.user.id } },
        });

        if (existing) { skipped++; continue; }

        const validation = validateFeedUrl(feedData.url);
        if (!validation.valid) { failed++; continue; }

        const parsed = await parseFeed(feedData.url);

        const created = await prisma.feed.create({
          data: {
            url: feedData.url,
            title: parsed.title || feedData.title,
            siteUrl: parsed.siteUrl,
            description: parsed.description,
            imageUrl: parsed.imageUrl,
            language: parsed.language,
            lastFetched: new Date(),
            userId: session.user.id,
            ...(categoryId ? { categories: { create: { categoryId } } } : {}),
          },
          select: { id: true },
        });
        await storeNewItems(created.id, parsed.items.slice(0, 20));
        imported++;
      } catch { failed++; }
    }

    if (imported > 0) await cacheDel(`sidebar:${session.user.id}`);
    return NextResponse.json({ data: { total: feeds.length, imported, skipped, failed } });
  } catch (error) {
    console.error("OPML import error:", error);
    return NextResponse.json({ error: "Failed to import OPML" }, { status: 500 });
  }
}

// GET /api/opml - Export
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const feeds = await prisma.feed.findMany({
      // The read-it-later bucket (feed2040://saved) is not a real feed.
      where: { userId: session.user.id, isSystem: false },
      include: { categories: { include: { category: true } } },
    });

    const categoryMap = new Map<string, typeof feeds>();
    const uncategorized: typeof feeds = [];

    for (const feed of feeds) {
      if (feed.categories.length === 0) {
        uncategorized.push(feed);
      } else {
        for (const fc of feed.categories) {
          const name = fc.category.name;
          if (!categoryMap.has(name)) categoryMap.set(name, []);
          categoryMap.get(name)!.push(feed);
        }
      }
    }

    const outlines = [];

    for (const [name, catFeeds] of categoryMap) {
      outlines.push({
        text: name, title: name,
        children: catFeeds.map((f: (typeof feeds)[number]) => ({
          text: f.title, title: f.title, type: "rss",
          xmlUrl: f.url, htmlUrl: f.siteUrl || undefined,
        })),
      });
    }

    if (uncategorized.length > 0) {
      outlines.push({
        text: "Uncategorized", title: "Uncategorized",
        children: uncategorized.map((f: (typeof feeds)[number]) => ({
          text: f.title, title: f.title, type: "rss",
          xmlUrl: f.url, htmlUrl: f.siteUrl || undefined,
        })),
      });
    }

    const opmlXml = generateOpml({ title: "Feed2040 - My Feeds", outlines });

    return new NextResponse(opmlXml, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": 'attachment; filename="feed2040-feeds.opml"',
      },
    });
  } catch (error) {
    console.error("OPML export error:", error);
    return NextResponse.json({ error: "Failed to export OPML" }, { status: 500 });
  }
}
