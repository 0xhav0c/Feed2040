"use client";

import { Suspense, useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArticlePanel } from "@/components/feed/ArticlePanel";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import {
  Loader2,
  Search,
  X,
  Keyboard,
  Sparkles,
  RefreshCw,
  Rss,
  Plus,
  CheckCheck,
  ArrowLeft,
  BookmarkPlus,
  Save,
  Bell,
  Brain,
} from "lucide-react";
import { toast } from "sonner";
import { isSafeUrl } from "@/lib/utils/url-validator";
import { LibraryTabs } from "@/components/layout/LibraryTabs";
import { DigestModal } from "@/components/feed/DigestModal";
import type { ArticleWithFeed } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  { key: "A", desc: "Mark all read in current view" },
  { key: "n", desc: "Next page" },
  { key: "p", desc: "Previous page" },
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
  const router = useRouter();
  const feedId = searchParams.get("feedId") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const tagId = searchParams.get("tagId") || "";
  const saved = searchParams.get("saved") === "1";
  const urlQuery = searchParams.get("q") || "";
  const urlFilter = searchParams.get("filter") || "";

  const [articles, setArticles] = useState<ArticleWithFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  const [page, setPage] = useState(1);
  // Bumped to re-run the fetch effect with the *current* view (calling a
  // captured fetchArticles after an await could load a view the user left).
  const [reloadKey, setReloadKey] = useState(0);
  // Articles read after this instant still count as "unread" for the Unread
  // view, so reading items on page 1 doesn't shift later pages and skip rows.
  const [unreadSince, setUnreadSince] = useState(() => new Date().toISOString());
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterTitle, setFilterTitle] = useState("");

  const [activeFilter, setActiveFilter] = useState<"" | "today" | "unread">("");
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticFallback, setSemanticFallback] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const [selectedArticle, setSelectedArticle] =
    useState<ArticleWithFeed | null>(null);
  const [mobileShowArticle, setMobileShowArticle] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showDigest, setShowDigest] = useState(false);
  const [showSaveSearch, setShowSaveSearch] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [saveSearchNotify, setSaveSearchNotify] = useState(false);
  const [savingSearch, setSavingSearch] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Monotonic id so only the most recent article request updates state,
  // guarding against out-of-order responses when navigating/filtering quickly.
  const requestIdRef = useRef(0);

  // Mirror of `articles` for stable callbacks that need the current list
  // without depending on it (which would re-register global listeners).
  const articlesRef = useRef(articles);
  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);
  const unreadSinceRef = useRef(unreadSince);
  useEffect(() => {
    unreadSinceRef.current = unreadSince;
  }, [unreadSince]);

  // Re-fetch the current view from page 1 (after refresh/save/mark-all).
  const reload = useCallback(() => {
    setPage(1);
    setUnreadSince(new Date().toISOString());
    setReloadKey((k) => k + 1);
  }, []);

  const fetchArticles = useCallback(
    async (p: number, q: string, filter: "" | "today" | "unread" = "") => {
      const reqId = ++requestIdRef.current;
      setLoading(true);
      try {
        // Semantic mode: meaning-based search (falls back to keyword server-side).
        if (semanticMode && q.trim()) {
          const res = await fetch("/api/articles/semantic-search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q }),
          });
          const data = await res.json();
          if (requestIdRef.current !== reqId) return;
          if (res.ok) {
            setArticles(data.data);
            setTotalPages(1);
            setTotal(data.data.length);
            setSemanticFallback(!!data.fallback);
          }
          return;
        }
        setSemanticFallback(false);

        const params = new URLSearchParams({
          page: String(p),
          limit: "50",
        });
        if (q) params.set("q", q);
        if (feedId) params.set("feedId", feedId);
        if (categoryId) params.set("categoryId", categoryId);
        if (tagId) params.set("tagId", tagId);
        if (saved) params.set("saved", "1");
        if (filter) params.set("filter", filter);
        if (filter === "unread") params.set("readSince", unreadSinceRef.current);
        params.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);

        const res = await fetch(`/api/articles?${params}`);
        const data = await res.json();
        // Ignore all but the most recent request so a slow earlier response
        // can't clobber newer results.
        if (requestIdRef.current !== reqId) return;
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
        if (requestIdRef.current !== reqId) return;
        console.error("Failed to fetch articles:", err);
      } finally {
        if (requestIdRef.current === reqId) setLoading(false);
      }
    },
    [feedId, categoryId, tagId, saved, semanticMode]
  );

  useEffect(() => {
    document.title = "Feeds | Feed2040";
  }, []);

  // Reset view state when the selected feed/category/tag changes (no fetch here
  // — the fetch effect below reacts to the resulting state/dependency change).
  // Reset view when nav params change; seed the search box from the URL's ?q=
  // so saved-search links apply their query automatically.
  useEffect(() => {
    // A pending debounced search from the previous view must not apply here.
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setPage(1);
    setUnreadSince(new Date().toISOString());
    setSelectedArticle(null);
    setMobileShowArticle(false);
    setSearchQuery(urlQuery);
    setSearchInput(urlQuery);
    // Seed the filter from the URL too, so saved-search links that carry a
    // Today/Unread filter apply it (they persist ?filter=).
    setActiveFilter(urlFilter === "today" || urlFilter === "unread" ? urlFilter : "");
  }, [feedId, categoryId, tagId, saved, urlQuery, urlFilter]);

  // Only the Unread view depends on the snapshot instant.
  const unreadKey = activeFilter === "unread" ? unreadSince : "";

  // Single source of fetching. The out-of-order guard in fetchArticles ensures
  // that when navigation triggers both a feedId change and a page reset, the
  // most recent request wins regardless of resolution order.
  useEffect(() => {
    fetchArticles(page, searchQuery, activeFilter);
  }, [feedId, categoryId, tagId, saved, page, searchQuery, activeFilter, semanticMode, fetchArticles, reloadKey, unreadKey]);

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (!feedId && !categoryId && !tagId) {
      setFilterTitle("");
      return;
    }
    // Clear the previous title so a stale one doesn't flash during the switch.
    setFilterTitle("");
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
      if (categoryId === "uncategorized") {
        setFilterTitle("Uncategorized");
        return;
      }
      fetch("/api/categories")
        .then((r) => r.json())
        .then((d) => {
          // The categories API returns a tree; search subcategories too.
          type Node = { id: string; name: string; children?: Node[] };
          const find = (nodes: Node[] = []): Node | undefined => {
            for (const n of nodes) {
              if (n.id === categoryId) return n;
              const hit = find(n.children);
              if (hit) return hit;
            }
            return undefined;
          };
          const c = find(d.data);
          if (c) setFilterTitle(c.name);
        })
        .catch(() => {});
    } else if (tagId) {
      fetch("/api/tags")
        .then((r) => r.json())
        .then((d) => {
          const t = d.data?.find(
            (x: { id: string; name: string }) => x.id === tagId
          );
          if (t) setFilterTitle(`#${t.name}`);
        })
        .catch(() => {});
    }
  }, [feedId, categoryId, tagId]);

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

  const selectFilter = useCallback((f: "" | "today" | "unread") => {
    setActiveFilter(f);
    setPage(1);
    setUnreadSince(new Date().toISOString());
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAllRead(true);
    try {
      let res: Response;
      if (semanticMode && searchQuery.trim()) {
        // Semantic results can't be re-derived server-side; mark exactly the
        // articles on screen.
        const ids = articlesRef.current.filter((a) => !a.isRead).map((a) => a.id);
        res = await fetch("/api/articles/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleIds: ids }),
        });
      } else {
        const body: Record<string, string> = {
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        if (feedId) body.feedId = feedId;
        if (categoryId) body.categoryId = categoryId;
        if (tagId) body.tagId = tagId;
        if (saved) body.saved = "1";
        if (searchQuery.trim()) body.q = searchQuery.trim();
        if (activeFilter) body.filter = activeFilter;

        res = await fetch("/api/articles/read-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      if (res.ok) {
        toast.success(`Marked ${data.data.marked ?? 0} articles as read`);
        setArticles((prev) => prev.map((a) => ({ ...a, isRead: true })));
        reload();
        // Tell the sidebar to refresh its per-category unread counts now.
        window.dispatchEvent(new Event("feed:read-changed"));
      } else {
        toast.error("Failed to mark articles as read");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setMarkingAllRead(false);
    }
  }, [feedId, categoryId, tagId, saved, semanticMode, activeFilter, reload, searchQuery]);

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
        reload();
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
              reload();
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
  }, [reload]);

  const [saveInput, setSaveInput] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);

  const handleSaveUrl = useCallback(
    async (rawUrl: string): Promise<boolean> => {
      const url = rawUrl.trim();
      if (!url || savingUrl) return false;
      setSavingUrl(true);
      try {
        const res = await fetch("/api/save-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (res.ok) {
          if (data.data?.duplicate) toast.info("Already saved");
          else toast.success("Saved for later");
          setSaveInput("");
          reload();
          return true;
        }
        toast.error(data.error || "Failed to save");
        return false;
      } catch {
        toast.error("Connection error");
        return false;
      } finally {
        setSavingUrl(false);
      }
    },
    [savingUrl, reload]
  );

  // Bookmarklet target: /feeds?saved=1&saveUrl=<encoded>. Auto-save once, then
  // strip the param so a refresh doesn't re-save.
  const saveUrlParam = searchParams.get("saveUrl");
  const savedUrlHandled = useRef(false);
  useEffect(() => {
    if (!saveUrlParam || savedUrlHandled.current) return;
    savedUrlHandled.current = true;
    handleSaveUrl(saveUrlParam).finally(() => {
      router.replace("/feeds?saved=1");
    });
  }, [saveUrlParam, handleSaveUrl, router]);

  const openSaveSearch = useCallback(() => {
    setSaveSearchName(searchQuery || filterTitle || "");
    setSaveSearchNotify(false);
    setShowSaveSearch(true);
  }, [searchQuery, filterTitle]);

  const handleSaveSearch = useCallback(async () => {
    const name = saveSearchName.trim();
    if (!name || !searchQuery.trim() || savingSearch) return;
    setSavingSearch(true);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          query: searchQuery.trim(),
          feedId: feedId || null,
          categoryId: categoryId || null,
          filter: activeFilter || null,
          notify: saveSearchNotify,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(saveSearchNotify ? "Search saved — monitoring on" : "Search saved");
        setShowSaveSearch(false);
        window.dispatchEvent(new Event("feed:read-changed"));
      } else {
        toast.error(data.error || "Failed to save search");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setSavingSearch(false);
    }
  }, [saveSearchName, searchQuery, savingSearch, feedId, categoryId, activeFilter, saveSearchNotify]);

  const selectedArticleRef = useRef(selectedArticle);
  useEffect(() => {
    selectedArticleRef.current = selectedArticle;
  }, [selectedArticle]);

  const handleBookmarkToggle = useCallback(async (articleId: string) => {
    // The open article may no longer be in the list (e.g. after paging), so
    // fall back to its own state rather than assuming "not bookmarked".
    const current =
      articlesRef.current.find((a) => a.id === articleId)?.isBookmarked ??
      (selectedArticleRef.current?.id === articleId ? selectedArticleRef.current.isBookmarked : false);
    const apply = (value: boolean) => {
      setArticles((prev) => prev.map((a) => (a.id === articleId ? { ...a, isBookmarked: value } : a)));
      setSelectedArticle((prev) => (prev?.id === articleId ? { ...prev, isBookmarked: value } : prev));
    };
    apply(!current);
    try {
      const res = await fetch("/api/articles/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, bookmarked: !current }),
      });
      if (!res.ok) throw new Error("bookmark failed");
    } catch {
      apply(current);
      toast.error("Failed to update bookmark");
    }
  }, []);

  const handleSelectArticle = useCallback((article: ArticleWithFeed) => {
    setSelectedArticle(article);
    setMobileShowArticle(true);
    // ArticlePanel marks it read on the server; mirror that in the counters.
    if (!articlesRef.current.find((a) => a.id === article.id)?.isRead) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setArticles((prev) =>
      prev.map((a) => (a.id === article.id ? { ...a, isRead: true } : a))
    );
  }, []);

  const handleToggleRead = useCallback(
    async (articleId: string) => {
      const article = articlesRef.current.find((a) => a.id === articleId);
      if (!article) return;
      const wasRead = article.isRead;
      setArticles((prev) =>
        prev.map((a) => (a.id === articleId ? { ...a, isRead: !wasRead } : a))
      );
      setUnreadCount((c) => Math.max(0, c + (wasRead ? 1 : -1)));
      try {
        const res = await fetch("/api/articles/read", {
          method: wasRead ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId }),
        });
        if (!res.ok) throw new Error("read toggle failed");
        window.dispatchEvent(new Event("feed:read-changed"));
      } catch {
        setArticles((prev) =>
          prev.map((a) => (a.id === articleId ? { ...a, isRead: wasRead } : a))
        );
        setUnreadCount((c) => Math.max(0, c + (wasRead ? -1 : 1)));
        toast.error("Failed to update read state");
      }
    },
    []
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
        if (selectedArticle?.url && isSafeUrl(selectedArticle.url)) {
          window.open(selectedArticle.url, "_blank", "noopener,noreferrer");
        }
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
      A: () => handleMarkAllRead(),
      n: () => {
        if (page < totalPages) setPage((p) => Math.min(totalPages, p + 1));
      },
      p: () => {
        if (page > 1) setPage((p) => Math.max(1, p - 1));
      },
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
      handleMarkAllRead,
      page,
      totalPages,
    ]
  );

  useKeyboardShortcuts(shortcuts);

  const title = saved
    ? "Library"
    : feedId
    ? filterTitle || "Feed"
    : categoryId
    ? filterTitle || "Category"
    : tagId
    ? filterTitle || "Tag"
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
            "overflow-hidden border-b border-border bg-card transition-all duration-200 ease-out flex-shrink-0",
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
                  <span className="font-medium text-signal">{refreshProgress.newArticles} new</span>
                  <span>{refreshProgress.updated} ok</span>
                  {refreshProgress.failed > 0 && (
                    <span className="text-destructive">{refreshProgress.failed} err</span>
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
          <div className={cn(
            "w-full md:w-[420px] flex-shrink-0 flex-col border-r border-border bg-card",
            mobileShowArticle ? "hidden md:flex" : "flex"
          )}>
            {/* List header */}
            <div className="flex-shrink-0 space-y-2.5 border-b border-border px-4 pb-3 pt-3.5">
              {saved && <LibraryTabs active="saved" />}
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">{title}</h2>
                  <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
                    {refreshing
                      ? refreshProgress
                        ? `Refreshing ${refreshProgress.current}/${refreshProgress.total}…`
                        : "Refreshing…"
                      : searchQuery
                      ? `${total.toLocaleString("en-US")} results`
                      : `${unreadCount.toLocaleString("en-US")} unread`}
                  </span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-0.5">
                  {searchQuery.trim() && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={openSaveSearch} title="Save this search" aria-label="Save this search">
                      <Save size={17} />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={() => setShowDigest(true)} title="Daily Briefing" aria-label="Daily Briefing">
                    <Sparkles size={17} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground"
                    onClick={handleMarkAllRead}
                    disabled={markingAllRead || unreadCount === 0}
                    title="Mark all as read (Shift+A)"
                    aria-label="Mark all as read"
                  >
                    {markingAllRead ? <Loader2 size={17} className="animate-spin" /> : <CheckCheck size={17} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    title="Refresh feeds (r)"
                    aria-label="Refresh feeds"
                  >
                    <RefreshCw size={17} className={cn(refreshing && "animate-spin")} />
                  </Button>
                </div>
              </div>

              {/* Segmented filter */}
              <div role="tablist" aria-label="Filter" className="inline-flex rounded-[9px] border border-border bg-background p-[3px]">
                {([
                  ["", "All", null],
                  ["unread", "Unread", unreadCount],
                  ["today", "Today", todayCount],
                ] as const).map(([key, label, count]) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={activeFilter === key}
                    onClick={() => selectFilter(key)}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors",
                      activeFilter === key ? "bg-muted text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                    {count !== null && <span className="tabular-nums opacity-75">{count.toLocaleString("en-US")}</span>}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    ref={searchRef}
                    type="search"
                    value={searchInput}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder={semanticMode ? "Search by meaning…" : "Search articles  /"}
                    aria-label="Search articles"
                    className="h-9 bg-background pl-8 pr-8 text-[13.5px]"
                  />
                  {searchInput && (
                    <button
                      onClick={clearSearch}
                      className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => { setSemanticMode((v) => !v); setPage(1); }}
                  title={semanticMode ? "Semantic search: on" : "Semantic search: off"}
                  aria-label="Toggle semantic search"
                  aria-pressed={semanticMode}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    semanticMode
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Brain size={16} />
                </button>
              </div>
              {semanticMode && semanticFallback && searchQuery && (
                <p className="text-[12px] text-amber-400">
                  Embeddings unavailable — showing keyword results. Build the index in Settings › AI.
                </p>
              )}
            </div>

            {/* Save a URL (read-it-later) */}
            {saved && (
              <div className="border-b border-border px-3 py-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Input
                    type="url"
                    value={saveInput}
                    onChange={(e) => setSaveInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveUrl(saveInput);
                    }}
                    placeholder="Paste a URL to save…"
                    className="h-8 text-sm"
                    disabled={savingUrl}
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSaveUrl(saveInput)}
                    disabled={savingUrl || !saveInput.trim()}
                    className="h-8 shrink-0 gap-1.5"
                  >
                    {savingUrl ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <BookmarkPlus size={14} />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            )}

            {/* Article list */}
            <div ref={listRef} className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : articles.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 p-10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                    {saved ? <BookmarkPlus className="h-7 w-7 text-primary" /> : <Rss className="h-7 w-7 text-primary" />}
                  </div>
                  <div className="text-center">
                    <h3 className="text-base font-bold text-foreground">
                      {saved ? "Nothing saved yet" : "No articles"}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {saved
                        ? "Paste any URL above to read it later."
                        : searchQuery
                        ? "Try a different search"
                        : "Add feeds to get started"}
                    </p>
                    {!saved && !searchQuery && (
                      <Link
                        href="/feeds/add"
                        className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
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
          <div className={cn(
            "flex-1 flex-col min-w-0 bg-background",
            !mobileShowArticle ? "hidden md:flex" : "flex"
          )}>
            {/* Mobile back button */}
            {selectedArticle && (
              <button
                className="flex min-h-11 items-center gap-2 border-b border-border bg-background px-4 text-sm font-medium text-muted-foreground hover:text-foreground md:hidden"
                onClick={() => setMobileShowArticle(false)}
              >
                <ArrowLeft size={17} />
                {title}
              </button>
            )}
            {selectedArticle ? (
              <ArticlePanel
                article={selectedArticle}
                onClose={() => { setSelectedArticle(null); setMobileShowArticle(false); }}
                onBookmarkToggle={handleBookmarkToggle}
                bookmarked={
                  articles.find((a) => a.id === selectedArticle.id)?.isBookmarked ??
                  !!selectedArticle.isBookmarked
                }
              />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="space-y-3 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card">
                    <Rss className="h-6 w-6 text-muted-foreground" aria-hidden />
                  </div>
                  <p className="text-[15px] text-foreground/90">
                    Select an article to read
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Use <kbd className="rounded border border-border px-1.5 py-0.5 text-xs font-mono">j</kbd> / <kbd className="rounded border border-border px-1.5 py-0.5 text-xs font-mono">k</kbd> to navigate
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <DigestModal open={showDigest} onClose={() => setShowDigest(false)} />

      <Dialog open={showSaveSearch} onOpenChange={setShowSaveSearch}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Save size={18} className="text-primary" />
              <DialogTitle className="text-lg">Save Search</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                autoFocus
                value={saveSearchName}
                onChange={(e) => setSaveSearchName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveSearch(); }}
                placeholder="e.g., CVE watch"
                maxLength={100}
                className="mt-1"
              />
            </div>
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Query: <span className="font-medium text-foreground">{searchQuery}</span>
            </p>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={saveSearchNotify}
                onChange={(e) => setSaveSearchNotify(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="flex items-center gap-1.5">
                <Bell size={14} className="text-muted-foreground" />
                Notify me on Telegram when new articles match
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowSaveSearch(false)}>Cancel</Button>
              <Button onClick={handleSaveSearch} disabled={savingSearch || !saveSearchName.trim()}>
                {savingSearch ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

/* ─── List row ──────────────────────────────────────────────── */
const MailListItem = memo(function MailListItem({
  article,
  isSelected,
  onSelect,
}: {
  article: ArticleWithFeed;
  isSelected: boolean;
  onSelect: (article: ArticleWithFeed) => void;
}) {
  const timeAgo = useMemo(() => {
    const dateStr = article.publishedAt || article.createdAt;
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (date.getTime() > new Date().getTime() + 86400000) return null;
    return formatDistanceToNow(date, { addSuffix: false }).replace(/^about /, "");
  }, [article.createdAt, article.publishedAt]);

  const firstTag = article.tags?.[0];

  return (
    <button
      data-article-id={article.id}
      data-article-row
      onClick={() => onSelect(article)}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "relative block w-full border-b border-border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        isSelected
          ? "bg-gradient-to-r from-brand/[0.18] to-brand/[0.04] shadow-[inset_2px_0_0_var(--primary)]"
          : "hover:bg-muted/70"
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <FeedMark title={article.feed.title} faviconUrl={article.feed.faviconUrl} />
        <span className="min-w-0 truncate text-foreground/80">{article.feed.title}</span>
        {timeAgo && (
          <>
            <span aria-hidden>·</span>
            <time className="shrink-0" dateTime={String(article.publishedAt || article.createdAt)}>{timeAgo}</time>
          </>
        )}
        {firstTag && (
          <span className="ml-1 shrink-0 rounded-[5px] border border-border bg-muted px-1.5 text-[11px] leading-[18px] text-muted-foreground">
            {firstTag.name}
          </span>
        )}
        {!article.isRead && (
          <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-signal shadow-[0_0_8px] shadow-signal/60" aria-label="Unread" />
        )}
      </div>
      <p
        className={cn(
          "mt-1.5 line-clamp-2 text-[14.5px] leading-snug",
          article.isRead ? "font-medium text-foreground/70" : "font-semibold text-foreground"
        )}
      >
        {article.title}
      </p>
      {article.summary && (
        <p className="mt-1 line-clamp-2 text-[13px] leading-normal text-muted-foreground">{article.summary}</p>
      )}
    </button>
  );
});

/** Feed favicon, or a coloured initial when the feed has none. */
function FeedMark({ title, faviconUrl }: { title: string; faviconUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (faviconUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={faviconUrl} alt="" className="h-4 w-4 shrink-0 rounded-[4px]" loading="lazy" onError={() => setFailed(true)} />;
  }
  const hue = [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-bold text-white"
      style={{ background: `hsl(${hue} 55% 42%)` }}
      aria-hidden
    >
      {title.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
