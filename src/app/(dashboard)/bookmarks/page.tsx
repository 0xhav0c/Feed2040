"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Header } from "@/components/layout/Header";
import { FeedArticleList } from "@/components/feed/FeedArticleList";
import { ArticlePanel } from "@/components/feed/ArticlePanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bookmark, Loader2, Search, X } from "lucide-react";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import type { ViewMode, ArticleWithFeed } from "@/types";
import { isSafeUrl } from "@/lib/utils/url-validator";
import { toast } from "sonner";
import { LibraryTabs } from "@/components/layout/LibraryTabs";

const PAGE_SIZE = 30;

export default function BookmarksPage() {
  const [allArticles, setAllArticles] = useState<ArticleWithFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedArticle, setSelectedArticle] = useState<ArticleWithFeed | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Bookmarks | Feed2040";
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/articles/bookmarks");
        const data = await res.json();
        if (res.ok) {
          setAllArticles(data.data);
          setBookmarkedIds(new Set(data.data.map((a: ArticleWithFeed) => a.id)));
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return allArticles;
    const q = searchQuery.toLowerCase();
    return allArticles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.summary?.toLowerCase().includes(q) ||
        a.feed?.title?.toLowerCase().includes(q) ||
        a.author?.toLowerCase().includes(q)
    );
  }, [allArticles, searchQuery]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedArticles = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const handleBookmarkToggle = useCallback(
    async (articleId: string) => {
      const wasBookmarked = bookmarkedIds.has(articleId);
      const apply = (value: boolean) => {
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          if (value) next.add(articleId);
          else next.delete(articleId);
          return next;
        });
        setAllArticles((prev) =>
          prev.map((a) => (a.id === articleId ? { ...a, isBookmarked: value } : a))
        );
      };
      apply(!wasBookmarked);
      try {
        const res = await fetch("/api/articles/bookmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId, bookmarked: !wasBookmarked }),
        });
        if (!res.ok) throw new Error("bookmark failed");
      } catch {
        apply(wasBookmarked);
        toast.error("Failed to update bookmark");
      }
    },
    [bookmarkedIds]
  );

  function handleSelectArticle(article: ArticleWithFeed) {
    setSelectedArticle(article);
    setAllArticles((prev) => prev.map((a) => (a.id === article.id ? { ...a, isRead: true } : a)));
  }

  const selectedIndex = useMemo(() => {
    if (!selectedArticle) return -1;
    return paginatedArticles.findIndex((a) => a.id === selectedArticle.id);
  }, [selectedArticle, paginatedArticles]);

  const bookmarkShortcuts = useMemo(
    () => ({
      j: () => {
        if (paginatedArticles.length === 0) return;
        const next = selectedIndex < paginatedArticles.length - 1 ? selectedIndex + 1 : 0;
        handleSelectArticle(paginatedArticles[next]);
      },
      k: () => {
        if (paginatedArticles.length === 0) return;
        const prev = selectedIndex > 0 ? selectedIndex - 1 : paginatedArticles.length - 1;
        handleSelectArticle(paginatedArticles[prev]);
      },
      o: () => {
        if (selectedArticle?.url && isSafeUrl(selectedArticle.url)) {
          window.open(selectedArticle.url, "_blank", "noopener,noreferrer");
        }
      },
      b: () => {
        if (selectedArticle) handleBookmarkToggle(selectedArticle.id);
      },
      "/": () => searchRef.current?.focus(),
      Escape: () => {
        if (selectedArticle) setSelectedArticle(null);
      },
    }),
    [paginatedArticles, selectedIndex, selectedArticle, handleBookmarkToggle]
  );

  useKeyboardShortcuts(bookmarkShortcuts);

  return (
    <>
      <Header
        title="Library"
        subtitle={`${filtered.length} bookmarked article${filtered.length === 1 ? "" : "s"}`}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <div className="flex-1 overflow-y-auto">
        {/* Search bar */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur md:px-6">
          <LibraryTabs active="bookmarks" />
          <div className="relative w-full max-w-md flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bookmarks  /"
              aria-label="Search bookmarks"
              className="h-9 w-full pl-9 pr-8 text-[13.5px]"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 p-12 pt-24">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Bookmark className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold">
                {searchQuery ? "No matching articles" : "No bookmarks yet"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {searchQuery
                  ? "Try a different search term"
                  : "Press b or the bookmark icon on any article to keep it here"}
              </p>
            </div>
          </div>
        ) : (
          <>
            <FeedArticleList
              viewMode={viewMode}
              articles={paginatedArticles}
              onSelectArticle={handleSelectArticle}
              selectedArticleId={selectedArticle?.id}
              onBookmarkToggle={handleBookmarkToggle}
            />
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 border-t border-border px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <ArticlePanel
        article={selectedArticle}
        onClose={() => setSelectedArticle(null)}
        onBookmarkToggle={handleBookmarkToggle}
        bookmarked={selectedArticle ? bookmarkedIds.has(selectedArticle.id) : false}
      />
    </>
  );
}
