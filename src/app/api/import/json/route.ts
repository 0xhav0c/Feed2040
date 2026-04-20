import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseFeed } from "@/lib/rss/parser";
import { z } from "zod";

const importSchema = z.object({
  feeds: z.array(
    z.object({
      url: z.string().url(),
      title: z.string().optional(),
      siteUrl: z.string().optional(),
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      faviconUrl: z.string().optional(),
      language: z.string().optional(),
      categorySlugs: z.array(z.string()).optional(),
    })
  ),
  categories: z
    .array(
      z.object({
        name: z.string(),
        slug: z.string(),
        icon: z.string().optional(),
        color: z.string().optional(),
        parentSlug: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = importSchema.parse(body);

    let feedsImported = 0;
    let categoriesImported = 0;
    let skipped = 0;

    const categorySlugToId = new Map<string, string>();

    if (parsed.categories?.length) {
      let sortOrder = 0;
      const cats = parsed.categories;
      let remaining = [...cats];
      while (remaining.length > 0) {
        const batch = remaining.filter(
          (c) => !c.parentSlug || categorySlugToId.has(c.parentSlug)
        );
        if (batch.length === 0) break;
        remaining = remaining.filter((c) => !batch.includes(c));
        for (const c of batch) {
          const existing = await prisma.category.findUnique({
            where: { slug_userId: { slug: c.slug, userId: session.user.id } },
          });
          if (existing) {
            categorySlugToId.set(c.slug, existing.id);
            continue;
          }
          const parentId = c.parentSlug
            ? categorySlugToId.get(c.parentSlug) ?? null
            : null;
          const created = await prisma.category.create({
            data: {
              name: c.name,
              slug: c.slug,
              icon: c.icon,
              color: c.color,
              parentId,
              sortOrder: c.sortOrder ?? sortOrder++,
              userId: session.user.id,
            },
          });
          categorySlugToId.set(c.slug, created.id);
          categoriesImported++;
        }
      }
    }

    for (const feedData of parsed.feeds) {
      const existing = await prisma.feed.findUnique({
        where: { url_userId: { url: feedData.url, userId: session.user.id } },
      });
      if (existing) {
        skipped++;
        continue;
      }

      try {
        const parsedFeed = await parseFeed(feedData.url);
        const categoryIds: string[] = [];
        if (feedData.categorySlugs?.length) {
          for (const slug of feedData.categorySlugs) {
            let catId = categorySlugToId.get(slug);
            if (!catId) {
              const cat = await prisma.category.findUnique({
                where: { slug_userId: { slug, userId: session.user.id } },
              });
              if (cat) {
                catId = cat.id;
                categorySlugToId.set(slug, cat.id);
              }
            }
            if (catId) categoryIds.push(catId);
          }
        }

        await prisma.feed.create({
          data: {
            url: feedData.url,
            title: feedData.title ?? parsedFeed.title,
            siteUrl: feedData.siteUrl ?? parsedFeed.siteUrl,
            description: feedData.description ?? parsedFeed.description,
            imageUrl: feedData.imageUrl ?? parsedFeed.imageUrl,
            language: feedData.language ?? parsedFeed.language,
            lastFetched: new Date(),
            userId: session.user.id,
            categories:
              categoryIds.length > 0
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
        });
        feedsImported++;
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({
      data: { feedsImported, categoriesImported, skipped },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Import JSON error:", error);
    return NextResponse.json({ error: "Failed to import" }, { status: 500 });
  }
}
