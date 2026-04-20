export type FeedWithDetails = {
  id: string;
  title: string;
  url: string;
  siteUrl: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  language: string | null;
  lastFetched: Date | null;
  errorCount: number;
  categories: CategoryBasic[];
  _count: { articles: number };
  createdAt: Date;
  updatedAt: Date;
};

export type CategoryBasic = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
};

export type CategoryWithCount = CategoryBasic & {
  sortOrder: number;
  parentId: string | null;
  _count: { feeds: number };
};

export type ArticleWithFeed = {
  id: string;
  title: string;
  url: string;
  content: string | null;
  summary: string | null;
  aiSummary: string | null;
  author: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
  enclosureUrl: string | null;
  enclosureType: string | null;
  enclosureDuration: string | null;
  feed: {
    id: string;
    title: string;
    faviconUrl: string | null;
  };
  isRead: boolean;
  isBookmarked: boolean;
  createdAt: Date;
};

export type FeedPreview = {
  title: string;
  description: string | null;
  siteUrl: string | null;
  imageUrl: string | null;
  language: string | null;
  itemCount: number;
  items: FeedPreviewItem[];
};

export type FeedPreviewItem = {
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  publishedAt: Date | null;
};

export const VIEW_MODES = {
  List: "list",
  Card: "card",
  Magazine: "magazine",
} as const;

export type ViewMode = (typeof VIEW_MODES)[keyof typeof VIEW_MODES];
