"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Tag as TagIcon,
  Rss,
  Bookmark,
  Library as LibraryIcon,
  Search,
  Bell,
  Trash2,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  LogOut,
  User,
  FolderOpen,
  FolderTree,
  Sparkles,
  LayoutDashboard,
  Newspaper,
  Code,
  Bot,
  FlaskConical,
  Palette,
  TrendingUp,
  Gamepad2,
  Heart,
  BookOpen,
  Globe,
  Zap,
  Music,
  Camera,
  Coffee,
  Briefcase,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { OPEN_COMMAND_PALETTE } from "@/components/layout/CommandPalette";
import { FeedContextMenu } from "@/components/feed/FeedContextMenu";
import { FeedEditDialog } from "@/components/feed/FeedEditDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ICON_MAP: Record<string, LucideIcon> = {
  FolderTree,
  Rss,
  Bookmark,
  Newspaper,
  Code,
  Bot,
  FlaskConical,
  Palette,
  TrendingUp,
  Gamepad2,
  Heart,
  BookOpen,
  Globe,
  Zap,
  Music,
  Camera,
  Coffee,
  Briefcase,
  GraduationCap,
};

function getCategoryIcon(icon: string | null): LucideIcon {
  if (!icon) return FolderTree;
  return ICON_MAP[icon] ?? FolderTree;
}

type SidebarFeed = {
  id: string;
  title: string;
  faviconUrl: string | null;
  unread: number;
  total: number;
};

type SidebarCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  feeds: SidebarFeed[];
  unread: number;
};

// "Saved" (read-it-later links) and "Read Later" (bookmarks) were two entries
// for the same intent; they now live together under Library.
const NAV_ITEMS = [
  { key: "overview", href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { key: "feeds", href: "/feeds", label: "All Feeds", icon: Rss },
  { key: "briefing", href: "/briefing", label: "Daily Briefing", icon: Sparkles },
  { key: "library", href: "/bookmarks", label: "Library", icon: LibraryIcon },
] as const;

type SidebarProps = {
  onNavigate?: () => void;
};

export function Sidebar({ onNavigate }: SidebarProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-[260px] border-r border-sidebar-border bg-sidebar" />
      }
    >
      <SidebarInner onNavigate={onNavigate} />
    </Suspense>
  );
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();

  const [categories, setCategories] = useState<SidebarCategory[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [tags, setTags] = useState<{ id: string; name: string; count: number }[]>([]);
  const [savedSearches, setSavedSearches] = useState<
    { id: string; name: string; query: string; feedId: string | null; categoryId: string | null; filter: string | null; notify: boolean }[]
  >([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const [editFeed, setEditFeed] = useState<{ id: string; title: string } | null>(null);
  const [deleteFeed, setDeleteFeed] = useState<{ id: string; title: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const activeFeedId = searchParams.get("feedId") || "";
  const activeCategoryId = searchParams.get("categoryId") || "";
  const activeTagId = searchParams.get("tagId") || "";
  const activeSaved = searchParams.get("saved") === "1";

  const handleEditSave = async (id: string, title: string, options?: { scrapeFullText?: boolean; refreshInterval?: number | null }) => {
    try {
      const res = await fetch(`/api/feeds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, ...options }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save feed");
        return;
      }
    } catch {
      toast.error("Failed to save feed");
      return;
    }
    setEditFeed(null);
    fetchSidebar();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteFeed) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/feeds/${deleteFeed.id}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) {
        toast.error("Failed to delete feed");
        return;
      }
      setDeleteFeed(null);
      if (activeFeedId === deleteFeed.id) {
        router.push("/feeds");
      }
      fetchSidebar();
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteSearch = async (id: string) => {
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
    try {
      await fetch(`/api/saved-searches/${id}`, { method: "DELETE" });
    } catch {
      /* silent; already removed optimistically */
    }
  };

  const searchHref = (s: { query: string; feedId: string | null; categoryId: string | null; filter: string | null }) => {
    const p = new URLSearchParams();
    p.set("q", s.query);
    if (s.feedId) p.set("feedId", s.feedId);
    if (s.categoryId) p.set("categoryId", s.categoryId);
    if (s.filter) p.set("filter", s.filter);
    return `/feeds?${p.toString()}`;
  };

  const fetchSidebar = useCallback(async () => {
    try {
      const [sideRes, tagsRes, searchRes] = await Promise.all([
        fetch("/api/sidebar"),
        fetch("/api/tags"),
        fetch("/api/saved-searches"),
      ]);
      const data = await sideRes.json();
      if (sideRes.ok && data.data) {
        setCategories(data.data.categories);
        setTotalUnread(data.data.totalUnread);
      }
      const tagsData = await tagsRes.json();
      if (tagsRes.ok && Array.isArray(tagsData.data)) {
        setTags(tagsData.data.filter((t: { count: number }) => t.count > 0));
      }
      const searchData = await searchRes.json();
      if (searchRes.ok && Array.isArray(searchData.data)) {
        setSavedSearches(searchData.data);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchSidebar();
    const interval = setInterval(() => {
      if (!document.hidden) fetchSidebar();
    }, 60_000);
    // Refresh immediately when read state changes elsewhere (e.g. "mark all
    // read" on the feed list) instead of waiting for the next interval tick.
    // Debounced: reading through articles with j/k fires this per article.
    let readTimer: ReturnType<typeof setTimeout> | null = null;
    const onReadChanged = () => {
      if (readTimer) clearTimeout(readTimer);
      readTimer = setTimeout(fetchSidebar, 800);
    };
    window.addEventListener("feed:read-changed", onReadChanged);
    return () => {
      clearInterval(interval);
      if (readTimer) clearTimeout(readTimer);
      window.removeEventListener("feed:read-changed", onReadChanged);
    };
  }, [fetchSidebar]);

  function toggleCat(id: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const navActive = (item: (typeof NAV_ITEMS)[number]) => {
    const onListRoot = !activeFeedId && !activeCategoryId && !activeTagId;
    if (item.key === "library") return pathname.startsWith("/bookmarks") || activeSaved;
    if (item.key === "feeds") return pathname === "/feeds" && onListRoot && !activeSaved;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  const rowBase =
    "relative flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors duration-150";
  const rowIdle = "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground";
  const rowOn = "bg-sidebar-accent text-foreground";

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-[64px]" : "w-[260px]"
      )}
    >
      {/* Brand + add feed */}
      <div className={cn("flex h-16 items-center gap-2 px-4", collapsed && "justify-center px-2")}>
        <Link href="/feeds" onClick={onNavigate} className="flex min-w-0 items-center gap-2.5" aria-label="Feed2040 home">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-signal shadow-[0_4px_16px_-4px] shadow-brand/60">
            <Rss className="h-4 w-4 text-white" aria-hidden />
          </span>
          {!collapsed && <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">Feed2040</span>}
        </Link>
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-8 w-8 rounded-lg text-sidebar-foreground hover:text-foreground"
                  onClick={() => {
                    router.push("/feeds/add");
                    onNavigate?.();
                  }}
                  aria-label="Add feed"
                />
              }
            >
              <Plus size={18} />
            </TooltipTrigger>
            <TooltipContent side="right">Add feed</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* ⌘K */}
      <div className={cn("px-3 pb-3", collapsed && "px-2")}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE))}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-card px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-input hover:text-foreground",
            collapsed && "justify-center px-0"
          )}
          aria-label="Search or jump to (Ctrl+K)"
        >
          <Search size={15} aria-hidden />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search or jump to…</span>
              <kbd className="rounded border border-sidebar-border px-1.5 text-[10.5px] font-medium">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
        <nav className="space-y-0.5" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const isActive = navActive(item);
            const Icon = item.icon;
            const link = (
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={cn(rowBase, isActive ? rowOn : rowIdle, collapsed && "justify-center px-0")}
              >
                <Icon size={17} className={cn("shrink-0", isActive && "text-primary")} aria-hidden />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!collapsed && item.key === "feeds" && totalUnread > 0 && (
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-px text-[11.5px] font-medium tabular-nums",
                      isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {totalUnread > 9999 ? "9999+" : totalUnread.toLocaleString("en-US")}
                  </span>
                )}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger render={link} />
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.href}>{link}</div>
            );
          })}
        </nav>

        {/* Categories + feeds */}
        {!collapsed && categories.length > 0 && (
          <section className="mt-5" aria-label="Categories">
            <div className="flex items-center justify-between px-2.5 pb-1.5">
              <p className="text-[11.5px] font-medium text-muted-foreground">Categories</p>
              <Link href="/categories" onClick={onNavigate} className="text-[11.5px] text-muted-foreground hover:text-foreground">
                Manage
              </Link>
            </div>
            <div className="space-y-0.5">
              {categories.map((cat) => {
                const isExpanded = expandedCats.has(cat.id);
                const isCatActive = activeCategoryId === cat.id;
                const CatIcon = getCategoryIcon(cat.icon);
                return (
                  <Collapsible key={cat.id} open={isExpanded} onOpenChange={() => toggleCat(cat.id)}>
                    <div className={cn("group flex items-center rounded-lg", isCatActive ? rowOn : "hover:bg-sidebar-accent")}>
                      <CollapsibleTrigger
                        render={
                          <button
                            type="button"
                            className="flex h-9 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                            aria-label={isExpanded ? `Collapse ${cat.name}` : `Expand ${cat.name}`}
                          />
                        }
                      >
                        <ChevronDown size={13} className={cn("transition-transform duration-150", !isExpanded && "-rotate-90")} />
                      </CollapsibleTrigger>
                      <button
                        type="button"
                        className={cn(
                          "flex min-h-9 min-w-0 flex-1 items-center gap-2 pr-2.5 text-left text-[13.5px]",
                          isCatActive ? "text-foreground" : "text-sidebar-foreground group-hover:text-foreground"
                        )}
                        onClick={() => {
                          router.push(`/feeds?categoryId=${cat.id}`);
                          onNavigate?.();
                        }}
                        aria-current={isCatActive ? "page" : undefined}
                      >
                        <CatIcon
                          size={15}
                          className="shrink-0"
                          style={{ color: cat.color || "var(--primary)" }}
                          aria-hidden
                        />
                        <span className="flex-1 truncate">{cat.name}</span>
                        {cat.unread > 0 && (
                          <span className="rounded-md bg-muted px-1.5 py-px text-[11px] tabular-nums text-muted-foreground">
                            {cat.unread}
                          </span>
                        )}
                      </button>
                    </div>

                    <CollapsibleContent>
                      {cat.feeds.length > 0 && (
                        <div className="ml-3 space-y-px border-l border-sidebar-border py-0.5 pl-2">
                          {cat.feeds.map((feed) => {
                            const isFeedActive = activeFeedId === feed.id;
                            return (
                              <div key={feed.id} className="group flex items-center gap-0.5">
                                <button
                                  type="button"
                                  className={cn(
                                    "flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors",
                                    isFeedActive ? rowOn : rowIdle
                                  )}
                                  onClick={() => {
                                    router.push(`/feeds?feedId=${feed.id}`);
                                    onNavigate?.();
                                  }}
                                  aria-current={isFeedActive ? "page" : undefined}
                                >
                                  {feed.faviconUrl ? (
                                    <img src={feed.faviconUrl} alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm" loading="lazy" />
                                  ) : (
                                    <Rss size={12} className="shrink-0 opacity-60" aria-hidden />
                                  )}
                                  <span className="flex-1 truncate">{feed.title}</span>
                                  {feed.unread > 0 && (
                                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{feed.unread}</span>
                                  )}
                                </button>
                                <FeedContextMenu
                                  feedId={feed.id}
                                  feedTitle={feed.title}
                                  onEdit={(id, title) => setEditFeed({ id, title })}
                                  onDelete={(id, title) => setDeleteFeed({ id, title })}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </section>
        )}

        {/* Tags */}
        {!collapsed && tags.length > 0 && (
          <section className="mt-5" aria-label="Tags">
            <p className="px-2.5 pb-1.5 text-[11.5px] font-medium text-muted-foreground">Tags</p>
            <div className="flex flex-wrap gap-1.5 px-2">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    router.push(`/feeds?tagId=${tag.id}`);
                    onNavigate?.();
                  }}
                  aria-current={activeTagId === tag.id ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
                    activeTagId === tag.id
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-sidebar-border text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <TagIcon size={11} aria-hidden />
                  {tag.name}
                  <span className="tabular-nums opacity-70">{tag.count}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Saved searches */}
        {!collapsed && savedSearches.length > 0 && (
          <section className="mt-5" aria-label="Saved searches">
            <p className="px-2.5 pb-1.5 text-[11.5px] font-medium text-muted-foreground">Searches</p>
            <div className="space-y-0.5">
              {savedSearches.map((s) => (
                <div key={s.id} className="group flex items-center gap-0.5">
                  <button
                    type="button"
                    className={cn(rowBase, rowIdle, "min-h-8 text-[13px]")}
                    onClick={() => {
                      router.push(searchHref(s));
                      onNavigate?.();
                    }}
                  >
                    <Search size={14} className="shrink-0 opacity-70" aria-hidden />
                    <span className="flex-1 truncate text-left">{s.name}</span>
                    {s.notify && <Bell size={12} className="shrink-0 text-signal" aria-label="Monitoring on" />}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-md text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDeleteSearch(s.id)}
                    aria-label={`Delete search ${s.name}`}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {collapsed && categories.length > 0 && (
          <div className="mt-4 flex justify-center">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent"
                    onClick={() => setCollapsed(false)}
                    aria-label="Expand to see categories"
                  />
                }
              >
                <FolderOpen size={17} />
              </TooltipTrigger>
              <TooltipContent side="right">Expand to see categories</TooltipContent>
            </Tooltip>
          </div>
        )}
      </ScrollArea>

      {/* Footer: settings, theme, account */}
      <div className="space-y-1 border-t border-sidebar-border p-3">
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          className={cn(rowBase, pathname.startsWith("/settings") ? rowOn : rowIdle, collapsed && "justify-center px-0")}
        >
          <Settings size={17} className={cn("shrink-0", pathname.startsWith("/settings") && "text-primary")} aria-hidden />
          {!collapsed && <span className="flex-1">Settings</span>}
        </Link>
        <div className={cn("flex items-center gap-2 pt-1", collapsed && "flex-col")}>
          <button
            type="button"
            className={cn(
              "flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              collapsed && "w-full flex-none justify-center px-0"
            )}
            onClick={async () => {
              // Pages cached by the service worker hold this user's content.
              if (typeof window !== "undefined" && "caches" in window) {
                try {
                  const keys = await caches.keys();
                  await Promise.all(keys.filter((k) => k.startsWith("feed2040-pages")).map((k) => caches.delete(k)));
                } catch {
                  /* best effort */
                }
              }
              signOut({ callbackUrl: "/login" });
            }}
            aria-label="Sign out"
            title="Sign out"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-muted text-[11px] font-semibold text-foreground">
              {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : <User size={13} />}
            </span>
            {!collapsed && (
              <>
                <span className="flex-1 truncate text-left">{session?.user?.name || "Sign out"}</span>
                <LogOut size={14} className="text-muted-foreground" aria-hidden />
              </>
            )}
          </button>
          {!collapsed && <div className="w-[96px] shrink-0"><ThemeToggle /></div>}
          {collapsed && <ThemeToggle collapsed />}
        </div>
        <button
          type="button"
          className="mt-1 flex h-7 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <FeedEditDialog
        open={!!editFeed}
        feedId={editFeed?.id || ""}
        initialTitle={editFeed?.title || ""}
        onSave={handleEditSave}
        onClose={() => setEditFeed(null)}
      />

      <ConfirmDialog
        open={!!deleteFeed}
        title="Delete Feed"
        description={`"${deleteFeed?.title}" and all its articles will be permanently deleted. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteFeed(null)}
        loading={deleteLoading}
      />
    </aside>
  );
}
