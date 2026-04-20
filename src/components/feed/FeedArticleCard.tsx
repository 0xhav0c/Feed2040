"use client";

import { memo, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ViewMode, ArticleWithFeed } from "@/types";
import { isSafeUrl } from "@/lib/utils/url-validator";

type Props = {
  article: ArticleWithFeed;
  viewMode: ViewMode;
  onSelect?: (article: ArticleWithFeed) => void;
  isSelected?: boolean;
};

function useTimeAgo(date: Date | null): string | null {
  const [timeAgo, setTimeAgo] = useState<string | null>(null);
  useEffect(() => {
    if (!date) return;
    const d = new Date(date);
    setTimeAgo(formatDistanceToNow(d, { addSuffix: true }));
    const interval = setInterval(() => {
      setTimeAgo(formatDistanceToNow(d, { addSuffix: true }));
    }, 60_000);
    return () => clearInterval(interval);
  }, [date]);
  return timeAgo;
}

export const FeedArticleCard = memo(function FeedArticleCard({
  article,
  viewMode,
  onSelect,
  isSelected = false,
}: Props) {
  const timeAgo = useTimeAgo(article.publishedAt);
  const [bookmarked, setBookmarked] = useState(article.isBookmarked);
  const [read, setRead] = useState(article.isRead);

  // Sync with parent state changes
  useEffect(() => {
    setBookmarked(article.isBookmarked);
    setRead(article.isRead);
  }, [article.isBookmarked, article.isRead]);

  const handleBookmark = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const prev = bookmarked;
      setBookmarked(!prev);
      try {
        await fetch("/api/articles/bookmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId: article.id }),
        });
      } catch {
        setBookmarked(prev);
      }
    },
    [article.id, bookmarked]
  );

  const handleClick = useCallback(() => {
    if (!read) setRead(true);
    if (onSelect) {
      onSelect(article);
    } else {
      if (isSafeUrl(article.url)) window.open(article.url, "_blank", "noopener,noreferrer");
    }
  }, [article, read, onSelect]);

  // ─── List View ─────────────────────────────────────────────
  if (viewMode === "list") {
    return (
      <article
        onClick={handleClick}
        className={cn(
          "group flex items-start gap-4 rounded-xl px-5 py-4 transition-all hover:bg-muted/60 cursor-pointer border border-transparent hover:border-border",
          read && "opacity-55",
          isSelected && "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
        )}
      >
        <div className="mt-2 flex-shrink-0">
          {!read ? (
            <div className="h-2 w-2 rounded-full bg-primary shadow-sm shadow-primary/50" />
          ) : (
            <div className="h-2 w-2" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="font-semibold text-primary/70">
              {article.feed.title}
            </span>
            {article.author && (
              <>
                <span className="text-border">·</span>
                <span>{article.author}</span>
              </>
            )}
            {timeAgo && (
              <>
                <span className="text-border">·</span>
                <span className="flex items-center gap-1.5">
                  <Clock size={12} />
                  {timeAgo}
                </span>
              </>
            )}
          </div>
          <h3 className="mt-1.5 text-[0.95rem] font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
            {article.title}
          </h3>
          {article.summary && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {article.summary}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleBookmark}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors"
            title={bookmarked ? "Remove bookmark" : "Add bookmark"}
          >
            {bookmarked ? (
              <BookmarkCheck size={14} className="text-primary" />
            ) : (
              <Bookmark size={14} className="text-muted-foreground" />
            )}
          </button>
          <a
            href={isSafeUrl(article.url) ? article.url : "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors"
            title="Open original"
          >
            <ExternalLink size={14} className="text-muted-foreground" />
          </a>
        </div>
      </article>
    );
  }

  // ─── Card View ─────────────────────────────────────────────
  if (viewMode === "card") {
    return (
      <article
        onClick={handleClick}
        className={cn(
          "group flex flex-col rounded-2xl border border-border bg-card p-4 transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 cursor-pointer",
          read && "opacity-55",
          isSelected && "ring-2 ring-primary border-primary/50"
        )}
      >
        {isSafeUrl(article.imageUrl) && (
          <div className="-mx-4 -mt-4 mb-3 h-36 overflow-hidden rounded-t-2xl bg-muted">
            <img
              src={article.imageUrl!}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        )}
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <span className="font-semibold text-primary/70">
            {article.feed.title}
          </span>
          {timeAgo && (
            <>
              <span className="text-border">·</span>
              <span>{timeAgo}</span>
            </>
          )}
        </div>
        <h3 className="mt-2 text-[0.95rem] font-bold leading-snug text-foreground group-hover:text-primary transition-colors">
          {article.title}
        </h3>
        {article.summary && (
          <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
            {article.summary}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-1.5">
            {!read && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-sm shadow-primary/50" />
            )}
            {article.author && (
              <span className="text-xs text-muted-foreground">
                {article.author}
              </span>
            )}
          </div>
          <button
            onClick={handleBookmark}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted transition-colors"
          >
            {bookmarked ? (
              <BookmarkCheck size={13} className="text-primary" />
            ) : (
              <Bookmark size={13} className="text-muted-foreground" />
            )}
          </button>
        </div>
      </article>
    );
  }

  // ─── Magazine View ─────────────────────────────────────────
  return (
    <article
      onClick={handleClick}
      className={cn(
        "group flex gap-5 rounded-2xl border border-border bg-card p-5 transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 cursor-pointer",
        read && "opacity-55",
        isSelected && "ring-2 ring-primary border-primary/50"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-primary/70">
            {article.feed.title}
          </span>
          {article.author && (
            <>
              <span className="text-border">·</span>
              <span>{article.author}</span>
            </>
          )}
          {timeAgo && (
            <>
              <span className="text-border">·</span>
              <span>{timeAgo}</span>
            </>
          )}
        </div>
        <h3 className="mt-2 text-lg font-bold leading-snug text-foreground group-hover:text-primary transition-colors">
          {article.title}
        </h3>
        {article.summary && (
          <p className="mt-2 line-clamp-3 text-[0.95rem] leading-relaxed text-muted-foreground">
            {article.summary}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handleBookmark}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            {bookmarked ? (
              <BookmarkCheck size={13} className="text-primary" />
            ) : (
              <Bookmark size={13} />
            )}
            {bookmarked ? "Saved" : "Save"}
          </button>
        </div>
      </div>
      {isSafeUrl(article.imageUrl) && (
        <div className="h-28 w-40 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
          <img
            src={article.imageUrl!}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      )}
    </article>
  );
});
