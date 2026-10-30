import type { Prisma } from "@prisma/client";
import { dayRangeInTz, resolveTimezone } from "@/lib/timezone";

// The sidebar lists feeds without a category under this pseudo-category id.
export const UNCATEGORIZED_ID = "uncategorized";

export interface ArticleScope {
  feedId?: string;
  categoryId?: string;
  tagId?: string;
  saved?: boolean;
  search?: string;
  filter?: string;
  /** IANA timezone used to compute "today"; defaults to DEFAULT_TIMEZONE. */
  tz?: string | null;
  /**
   * For the Unread filter: articles read at/after this instant still count as
   * unread, keeping the result set stable while the user reads through it.
   */
  readSince?: Date | null;
}

/**
 * Prisma where-clause for the article list views. Shared by the list, its
 * counters and "mark all as read" so all three always agree on which
 * articles a view contains.
 *
 * `filter` is applied only when `applyFilter` is true; the counters need the
 * view without the Today/Unread toggle.
 */
export function buildArticleWhere(
  userId: string,
  scope: ArticleScope,
  applyFilter = true
): Prisma.ArticleWhereInput {
  // Saved (read-it-later) articles live in the per-user system feed; every
  // other view excludes it so saved items stay in their own bucket.
  const feed: Prisma.FeedWhereInput = { userId, isSystem: !!scope.saved };

  if (scope.categoryId === UNCATEGORIZED_ID) {
    feed.categories = { none: {} };
  } else if (scope.categoryId) {
    feed.categories = { some: { categoryId: scope.categoryId } };
  }

  const where: Prisma.ArticleWhereInput = { feed };

  if (scope.feedId) where.feedId = scope.feedId;
  if (scope.tagId) where.tags = { some: { tagId: scope.tagId } };

  const search = scope.search?.trim();
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
      { author: { contains: search, mode: "insensitive" } },
      { feed: { title: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (applyFilter) {
    if (scope.filter === "unread") {
      if (scope.readSince) {
        where.AND = [
          {
            OR: [
              { readArticles: { none: { userId } } },
              { readArticles: { some: { userId, readAt: { gte: scope.readSince } } } },
            ],
          },
        ];
      } else {
        where.readArticles = { none: { userId } };
      }
    } else if (scope.filter === "today") {
      where.publishedAt = todayRange(scope.tz);
    }
  }

  return where;
}

export function todayRange(tz?: string | null): { gte: Date; lt: Date } {
  const { start, end } = dayRangeInTz(resolveTimezone(tz));
  return { gte: start, lt: end };
}
