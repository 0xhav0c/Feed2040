"use client";

import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ArticlePanel } from "@/components/feed/ArticlePanel";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import {
  Loader2,
  Search,
  X,
  Keyboard,
  Sparkles,
  RefreshCw,
  Clock,
  Rss,
  Plus,
  CheckCheck,
  CalendarDays,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { DigestModal } from "@/components/feed/DigestModal";
import type { ArticleWithFeed } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

const SHORTCUTS = [
  { key: "j", desc: "Select next article" },
  { key: "k", desc: "Select previous article" },
  { key: "o", desc: "Open original link in new tab" },
  { key: "b", desc: "Toggle bookmark" },
  { key: "m", desc: "Toggle read / unread" },
  { key: "t", desc: "Translate article" },
  { key: "s", desc: "AI summarize" },
  { key: "r", desc: "Refresh feeds" },
  { key: "Esc", desc: "Close article panel" },
  { key: "/", desc: "Focus search" },
  { key: "?", desc: "Toggle shortcut help" },
];

export default function FeedsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <FeedsContent />
    </Suspense>
  );
}

function FeedsContent() {
  const searchParams = useSearchParams();
  const feedId = searchParams.get("feedId") || "";
  const categoryId = searchParams.get("categoryId") || "";

  const [articles, setArticles] = useState<ArticleWithFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterTitle, setFilterTitle] = useState("");

  const [activeFilter, setActiveFilter] = useState<"" | "today" | "unread">("");
  const [todayCount, setTodayCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const [selectedArticle, setSelectedArticle] =
    useState<ArticleWithFeed | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showDigest, setShowDigest] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const bookmarkedIds = useMemo(() => {
    const ids = new Set<string>();
    articles.forEach((a) => {
      if (a.isBookmarked) ids.add(a.id);
    });
    return ids;
  }, [articles]);

  const fetchArticles = useCallback(
    async (p: number, q: string, filter: "" | "today" | "unread" = "") => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: "50",
        });
        if (q) params.set("q", q);
        if (feedId) params.set("feedId", feedId);
        if (categoryId) params.set("categoryId", categoryId);
        if (filter) params.set("filter", filter);

        const res = await fetch(`/api/articles?${params}`);
        const data = await res.json();
        if (res.ok) {
          setArticles(data.data);
          setTotalPages(data.pagination.totalPages);
          setTotal(data.pagination.total);
          if (data.stats) {
            setTodayCount(data.stats.today);
            setUnreadCount(data.stats.unread);
          }
        }
      } catch (err) {
        console.error("Failed to fetch articles:", err);
      } finally {
        setLoading(false);
      }
    },
    [feedId, categoryId]
  );

  useEffect(() => {
    setPage(1);
    setSearchQuery("");
    setSearchInput("");
    setActiveFilter("");
    fetchArticles(1, "", "");
  }, [feedId, categoryId, fetchArticles]);

  useEffect(() => {
    if (!feedId && !categoryId) return;
    if (feedId) {
      fetch("/api/feeds")
        .then((r) => r.json())
        .then((d) => {
          const f = d.data?.find(
            (x: { id: string; title: string }) => x.id === feedId
          );
          if (f) setFilterTitle(f.title);
        })
        .catch(() => {});
    } else if (categoryId) {
      fetch("/api/categories")
        .then((r) => r.json())
        .then((d) => {
          const c = d.data?.find(
            (x: { id: string; name: string }) => x.id === categoryId
          );
          if (c) setFilterTitle(c.name);
        })
        .catch(() => {});
    }
  }, [feedId, categoryId]);

  useEffect(() => {
    if (searchQuery !== undefined) {
      fetchArticles(page, searchQuery, activeFilter);
    }
  }, [fetchArticles, page, searchQuery, activeFilter]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      setSearchQuery(value);
    }, 500);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
    setPage(1);
  }, []);

  const toggleFilter = useCallback((f: "today" | "unread") => {
    setActiveFilter((prev) => (prev === f ? "" : f));
    setPage(1);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAllRead(true);
    try {
      const body: Record<string, string> = {};
      if (feedId) body.feedId = feedId;
      if (categoryId) body.categoryId = categoryId;
      if (activeFilter) body.filter = activeFilter;

      const res = await fetch("/api/articles/read-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Marked ${data.data.marked} articles as read`);
        setArticles((prev) => prev.map((a) => ({ ...a, isRead: true })));
        fetchArticles(page, searchQuery, activeFilter);
      } else {
        toast.error("Failed to mark articles as read");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setMarkingAllRead(false);
    }
  }, [feedId, categoryId, activeFilter, fetchArticles, page, searchQuery]);

  const [refreshProgress, setRefreshProgress] = useState<{
    current: number;
    total: number;
    feed: string;
    newArticles: number;
    updated: number;
    failed: number;
  } | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshProgress(null);
    try {
      const res = await fetch("/api/feeds/refresh-stream", { method: "POST" });
      if (!res.ok || !res.body) {
        const fallback = await fetch("/api/feeds/refresh", { method: "POST" });
        const data = await fallback.json();
        if (fallback.ok) toast.success(`Refreshed: ${data.data.newArticles} new articles`);
        else toast.error("Refresh failed");
        setRefreshing(false);
        setRefreshProgress(null);
        fetchArticles(1, searchQuery, activeFilter);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const match = line.match(/^data:\s*(.+)$/m);
          if (!match) continue;
          try {
            const evt = JSON.parse(match[1]);
            if (evt.type === "progress" || evt.type === "start") {
              setRefreshProgress({
                current: evt.current || 0,
                total: evt.total || 0,
                feed: evt.feed || "",
                newArticles: evt.newArticles || 0,
                updated: evt.updated || 0,
                failed: evt.failed || 0,
              });
            } else if (evt.type === "complete") {
              toast.success(`Refreshed: ${evt.newArticles} new articles from ${evt.updated} feeds`);
              setPage(1);
              fetchArticles(1, searchQuery, activeFilter);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshProgress(null), 2000);
    }
  }, [fetchArticles, searchQuery, activeFilter]);

  const handleBookmarkToggle = useCallback(async (articleId: string) => {
    setArticles((prev) =>
      prev.map((a) =>
        a.id === articleId ? { ...a, isBookmarked: !a.isBookmarked } : a
      )
    );
    try {
      await fetch("/api/articles/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      });
    } catch {
      setArticles((prev) =>
        prev.map((a) =>
          a.id === articleId ? { ...a, isBookmarked: !a.isBookmarked } : a
        )
      );
    }
  }, []);

  const handleSelectArticle = useCallback((article: ArticleWithFeed) => {
    setSelectedArticle(article);
    setArticles((prev) =>
      prev.map((a) => (a.id === article.id ? { ...a, isRead: true } : a))
    );
  }, []);

  const handleToggleRead = useCallback(
    async (articleId: string) => {
      const article = articles.find((a) => a.id === articleId);
      if (!article) return;
      const wasRead = article.isRead;
      setArticles((prev) =>
        prev.map((a) => (a.id === articleId ? { ...a, isRead: !wasRead } : a))
      );
      try {
        if (wasRead) {
          await fetch("/api/articles/read", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ articleId }),
          });
        } else {
          await fetch("/api/articles/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ articleId }),
          });
        }
      } catch {
        setArticles((prev) =>
          prev.map((a) => (a.id === articleId ? { ...a, isRead: wasRead } : a))
        );
      }
    },
    [articles]
  );

  const selectedIndex = useMemo(() => {
    if (!selectedArticle || articles.length === 0) return -1;
    return articles.findIndex((a) => a.id === selectedArticle.id);
  }, [selectedArticle, articles]);

  const shortcuts = useMemo(
    () => ({
      j: () => {
        if (articles.length === 0) return;
        const next = selectedIndex < articles.length - 1 ? selectedIndex + 1 : 0;
        handleSelectArticle(articles[next]);
      },
      k: () => {
        if (articles.length === 0) return;
        const prev = selectedIndex > 0 ? selectedIndex - 1 : articles.length - 1;
        handleSelectArticle(articles[prev]);
      },
      o: () => {
        if (selectedArticle?.url) window.open(selectedArticle.url, "_blank");
      },
      b: () => {
        if (selectedArticle) handleBookmarkToggle(selectedArticle.id);
      },
      m: () => {
        if (selectedArticle) handleToggleRead(selectedArticle.id);
      },
      s: () => {
        const btn = document.querySelector('[title="AI Summarize"]') as HTMLButtonElement | null;
        btn?.click();
      },
      t: () => {
        const btn = document.querySelector('[title="Translate article"]') as HTMLButtonElement | null;
        btn?.click();
      },
      "/": () => {
        searchRef.current?.focus();
      },
      r: () => handleRefresh(),
      Escape: () => {
        if (selectedArticle) setSelectedArticle(null);
      },
      "?": () => setShowHelpModal((s) => !s),
    }),
    [
      articles,
      selectedIndex,
      selectedArticle,
      handleSelectArticle,
      handleBookmarkToggle,
      handleToggleRead,
      handleRefresh,
    ]
  );

  useKeyboardShortcuts(shortcuts);

  const title = feedId
    ? filterTitle || "Feed"
    : categoryId
    ? filterTitle || "Category"
    : "All Feeds";

  const showRefreshBar = refreshing && refreshProgress && refreshProgress.total > 0;
  const refreshPercent = refreshProgress
    ? Math.round((refreshProgress.current / refreshProgress.total) * 100)
    : 0;

  // Scroll selected article into view in the list
  useEffect(() => {
    if (!selectedArticle || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-article-id="${selectedArticle.id}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedArticle]);

  return (
    <>
      {/* 3-panel layout: article list (left) | reading pane (right) */}
      <div className="flex h-full flex-col">
        {/* Refresh progress bar (spans full width) */}
        <div
          className={cn(
            "overflow-hidden border-b border-border bg-card/80 transition-all duration-300 ease-out flex-shrink-0",
            showRefreshBar ? "max-h-24 opacity-100" : "max-h-0 opacity-0"
          )}
        >
          {showRefreshBar && refreshProgress && (
            <div className="px-5 py-2 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Loader2 size={12} className="animate-spin text-primary shrink-0" />
                  <span className="text-muted-foreground truncate">
                    {refreshProgress.feed}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                  <span className="text-green-500 font-medium">{refreshProgress.newArticles} new</span>
                  <span>{refreshProgress.updated} ok</span>
                  {refreshProgress.failed > 0 && (
                    <span className="text-red-500">{refreshProgress.failed} err</span>
                  )}
                  <span className="font-mono">{refreshProgress.current}/{refreshProgress.total}</span>
                </div>
              </div>
              <Progress value={refreshPercent} className="h-1" />
            </div>
          )}
        </div>

        {/* Main content area */}
        <div className="flex flex-1 min-h-0">
          {/* LEFT: Article list panel */}
          <div className="flex w-[420px] flex-shrink-0 flex-col border-r border-border bg-card/30">
            {/* List header */}
            <div className="border-b border-border px-4 py-3 flex-shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-foreground truncate">{title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {refreshing
                      ? refreshProgress
                        ? `Refreshing ${refreshProgress.current}/${refreshProgress.total}...`
                        : "Refreshing..."
                      : searchQuery
                      ? `${total} results`
                      : `${total} articles`}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleMarkAllRead}
                    disabled={markingAllRead || unreadCount === 0}
                    title="Mark all as read"
                  >
                    {markingAllRead ? (
                      <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    ) : (
                      <CheckCheck size={16} className="text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowDigest(true)}
                    title="Daily Briefing"
                  >
                    <Sparkles size={16} className="text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    title="Refresh Feeds"
                  >
                    <RefreshCw
                      size={16}
                      className={cn(
                        "text-muted-foreground",
                        refreshing && "animate-spin"
                      )}
                    />
                  </Button>
                </div>
              </div>

              {/* Filter badges */}
              <div className="flex items-center gap-2">
                <Badge
                  variant={activeFilter === "today" ? "default" : "outline"}
                  className="cursor-pointer gap-1 text-xs"
                  onClick={() => toggleFilter("today")}
                >
                  <CalendarDays size={11} />
                  Today
                  <span className={cn(
                    "ml-0.5 font-bold",
                    activeFilter === "today" ? "text-primary-foreground" : "text-primary"
                  )}>
                    {todayCount}
                  </span>
                </Badge>
                <Badge
                  variant={activeFilter === "unread" ? "default" : "outline"}
                  className="cursor-pointer gap-1 text-xs"
                  onClick={() => toggleFilter("unread")}
                >
                  <Eye size={11} />
                  Unread
                  <span className={cn(
                    "ml-0.5 font-bold",
                    activeFilter === "unread" ? "text-primary-foreground" : "text-primary"
                  )}>
                    {unreadCount}
                  </span>
                </Badge>
              </div>
            </div>

            {/* Search */}
            <div className="border-b border-border px-3 py-2 flex-shrink-0">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  ref={searchRef}
                  type="text"
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search... (press /)"
                  className="pl-8 pr-7 h-8 text-sm"
                />
                {searchInput && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Article list */}
            <div ref={listRef} className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : articles.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 p-10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                    <Rss className="h-7 w-7 text-primary" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-base font-bold text-foreground">No articles</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {searchQuery ? "Try a different search" : "Add feeds to get started"}
                    </p>
                    {!searchQuery && (
                      <Link
                        href="/feeds/add"
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
                      >
                        <Plus size={14} />
                        Add feed
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {articles.map((article) => (
                    <MailListItem
                      key={article.id}
                      article={article}
                      isSelected={selectedArticle?.id === article.id}
                      onSelect={handleSelectArticle}
                    />
                  ))}

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 border-t border-border p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Prev
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {page} / {totalPages}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT: Reading pane */}
          <div className="flex-1 flex flex-col min-w-0 bg-background">
            {selectedArticle ? (
              <ArticlePanel
                article={selectedArticle}
                onClose={() => setSelectedArticle(null)}
                onBookmarkToggle={handleBookmarkToggle}
                bookmarked={bookmarkedIds.has(selectedArticle.id)}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                    <Rss className="h-7 w-7 text-muted-foreground/50" />
                  </div>
                  <p className="text-base text-muted-foreground">
                    Select an article to read
                  </p>
                  <p className="text-sm text-muted-foreground/60">
                    Use <kbd className="rounded border border-border px-1.5 py-0.5 text-xs font-mono">j</kbd> / <kbd className="rounded border border-border px-1.5 py-0.5 text-xs font-mono">k</kbd> to navigate
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <DigestModal open={showDigest} onClose={() => setShowDigest(false)} />

      <Dialog open={showHelpModal} onOpenChange={setShowHelpModal}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Keyboard size={20} className="text-primary" />
              <DialogTitle className="text-lg">Keyboard Shortcuts</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-2.5">
            {SHORTCUTS.map(({ key, desc }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-sm text-muted-foreground">{desc}</span>
                <kbd className="rounded-lg border border-border bg-muted px-2.5 py-1 text-xs font-mono">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Press <kbd className="rounded border border-border px-1.5">?</kbd> to close
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Mail-style list item ──────────────────────────────────── */
function MailListItem({
  article,
  isSelected,
  onSelect,
}: {
  article: ArticleWithFeed;
  isSelected: boolean;
  onSelect: (article: ArticleWithFeed) => void;
}) {
  const timeAgo = useMemo(() => {
    const dateStr = article.createdAt || article.publishedAt;
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    if (date.getTime() > now.getTime() + 86400000) return null;
    return formatDistanceToNow(date, { addSuffix: true });
  }, [article.createdAt, article.publishedAt]);

  return (
    <button
      data-article-id={article.id}
      onClick={() => onSelect(article)}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border/50 transition-colors hover:bg-muted/50 focus:outline-none",
        isSelected && "bg-primary/8 border-l-2 border-l-primary",
        !isSelected && "border-l-2 border-l-transparent",
        article.isRead && !isSelected && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Title */}
          <p
            className={cn(
              "text-[0.9rem] leading-snug truncate",
              !article.isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80"
            )}
          >
            {!article.isRead && (
              <span className="inline-block h-2 w-2 rounded-full bg-primary mr-2 flex-shrink-0 align-middle" />
            )}
            {article.title}
          </p>
          {/* Feed source */}
          <p className="mt-1 text-xs text-muted-foreground truncate">
            {article.feed.title}
            {article.author && <span> · {article.author}</span>}
          </p>
          {/* Summary preview */}
          {article.summary && (
            <p className="mt-1 text-xs text-muted-foreground/70 line-clamp-1">
              {article.summary}
            </p>
          )}
        </div>
        {/* Time */}
        {timeAgo && (
          <span className="flex-shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground/60 pt-0.5">
            <Clock size={10} />
            {timeAgo}
          </span>
        )}
      </div>
    </button>
  );
}
