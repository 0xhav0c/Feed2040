import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseFeed } from "@/lib/rss/parser";
import { validateFeedUrl } from "@/lib/utils/url-validator";
import { z } from "zod";

const addFeedSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
  categoryIds: z.array(z.string()).optional(),
});

// GET /api/feeds
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const feeds = await prisma.feed.findMany({
      where: { userId: session.user.id },
      include: {
        categories: {
          include: {
            category: {
              select: { id: true, name: true, slug: true, icon: true, color: true },
            },
          },
        },
        _count: { select: { articles: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = feeds.map((feed: (typeof feeds)[number]) => ({
      ...feed,
      categories: feed.categories.map((fc: (typeof feed.categories)[number]) => fc.category),
    }));

    return NextResponse.json({ data: formatted });
  } catch (error) {
    console.error("Failed to fetch feeds:", error);
    return NextResponse.json({ error: "Failed to fetch feeds" }, { status: 500 });
  }
}

// POST /api/feeds
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { url, categoryIds } = addFeedSchema.parse(body);

    const existingFeed = await prisma.feed.findUnique({
      where: { url_userId: { url, userId: session.user.id } },
    });

    if (existingFeed) {
      return NextResponse.json({ error: "This feed is already added" }, { status: 409 });
    }

    const validation = validateFeedUrl(url);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error ?? "Invalid URL" }, { status: 400 });
    }

    const parsedFeed = await parseFeed(url);

    const feed = await prisma.feed.create({
      data: {
        url,
        title: parsedFeed.title,
        siteUrl: parsedFeed.siteUrl,
        description: parsedFeed.description,
        imageUrl: parsedFeed.imageUrl,
        language: parsedFeed.language,
        lastFetched: new Date(),
        userId: session.user.id,
        categories: categoryIds?.length
          ? { create: categoryIds.map((categoryId) => ({ categoryId })) }
          : undefined,
        articles: {
          create: parsedFeed.items.slice(0, 50).map((item) => ({
            title: item.title,
            url: item.url,
            content: item.content,
            summary: item.summary,
            author: item.author,
            imageUrl: item.imageUrl,
            publishedAt: item.publishedAt,
            guid: item.guid,
          })),
        },
      },
      include: {
        _count: { select: { articles: true } },
        categories: {
          include: { category: { select: { id: true, name: true, slug: true, icon: true, color: true } } },
        },
      },
    });

    return NextResponse.json({ data: feed }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Failed to add feed:", error);
    return NextResponse.json({ error: "Failed to add feed. Please check the URL." }, { status: 500 });
  }
}
