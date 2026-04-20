"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { FeedArticleCard } from "./FeedArticleCard";
import type { ViewMode, ArticleWithFeed } from "@/types";
import { Rss, Plus } from "lucide-react";
import Link from "next/link";

type Props = {
  viewMode: ViewMode;
  articles?: ArticleWithFeed[];
  onSelectArticle?: (article: ArticleWithFeed) => void;
  selectedArticleId?: string | null;
};

export const FeedArticleList = memo(function FeedArticleList({
  viewMode,
  articles = [],
  onSelectArticle,
  selectedArticleId,
}: Props) {
  if (articles.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-16">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
          <Rss className="h-9 w-9 text-primary" />
        </div>
        <div className="text-center">
          <h3 className="text-xl font-bold text-foreground">No feeds yet</h3>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
            Subscribe to RSS feeds to start following the latest news and
            articles
          </p>
          <Link
            href="/feeds/add"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            <Plus size={16} />
            Add your first feed
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "p-4",
        viewMode === "card" &&
          "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
        viewMode === "magazine" && "grid grid-cols-1 gap-4 lg:grid-cols-2",
        viewMode === "list" && "space-y-0.5"
      )}
    >
      {articles.map((article) => (
        <FeedArticleCard
          key={article.id}
          article={article}
          viewMode={viewMode}
          onSelect={onSelectArticle}
          isSelected={selectedArticleId === article.id}
        />
      ))}
    </div>
  );
});
