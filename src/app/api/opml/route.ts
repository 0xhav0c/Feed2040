import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseOpml, generateOpml, flattenOpmlFeeds } from "@/lib/rss/opml";
import { parseFeed } from "@/lib/rss/parser";
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
        const slug = feedData.category.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "uncategorized";

        let category = await prisma.category.findUnique({
          where: { slug_userId: { slug, userId: session.user.id } },
        });

        if (!category) {
          category = await prisma.category.create({
            data: { name: feedData.category, slug, userId: session.user.id },
          });
        }

        const existing = await prisma.feed.findUnique({
          where: { url_userId: { url: feedData.url, userId: session.user.id } },
        });

        if (existing) { skipped++; continue; }

        const validation = validateFeedUrl(feedData.url);
        if (!validation.valid) { failed++; continue; }

        const parsed = await parseFeed(feedData.url);

        await prisma.feed.create({
          data: {
            url: feedData.url,
            title: parsed.title || feedData.title,
            siteUrl: parsed.siteUrl,
            description: parsed.description,
            imageUrl: parsed.imageUrl,
            language: parsed.language,
            lastFetched: new Date(),
            userId: session.user.id,
            categories: { create: { categoryId: category.id } },
            articles: {
              create: parsed.items.slice(0, 20).map((item) => ({
                title: item.title, url: item.url, content: item.content,
                summary: item.summary, author: item.author, imageUrl: item.imageUrl,
                publishedAt: item.publishedAt, guid: item.guid,
              })),
            },
          },
        });
        imported++;
      } catch { failed++; }
    }

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
      where: { userId: session.user.id },
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
