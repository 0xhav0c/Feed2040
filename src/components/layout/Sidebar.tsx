"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Rss,
  Bookmark,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Bot,
  LogOut,
  User,
  FolderOpen,
  Sparkles,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

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

const NAV_ITEMS = [
  { href: "/feeds", label: "All Feeds", icon: Rss, param: "" },
  { href: "/bookmarks", label: "Read Later", icon: Bookmark, param: "" },
  { href: "/briefing", label: "Daily Briefing", icon: Sparkles, param: "" },
  { href: "/settings", label: "Settings", icon: Settings, param: "" },
] as const;

type SidebarProps = {
  onNavigate?: () => void;
};

export function Sidebar({ onNavigate }: SidebarProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-80 bg-sidebar border-r border-sidebar-border" />
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
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const [editFeed, setEditFeed] = useState<{ id: string; title: string } | null>(null);
  const [deleteFeed, setDeleteFeed] = useState<{ id: string; title: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const activeFeedId = searchParams.get("feedId") || "";
  const activeCategoryId = searchParams.get("categoryId") || "";

  const handleEditSave = async (id: string, title: string, options?: { scrapeFullText?: boolean; refreshInterval?: number | null }) => {
    await fetch(`/api/feeds/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, ...options }),
    });
    setEditFeed(null);
    fetchSidebar();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteFeed) return;
    setDeleteLoading(true);
    try {
      await fetch(`/api/feeds/${deleteFeed.id}`, { method: "DELETE" });
      setDeleteFeed(null);
      if (activeFeedId === deleteFeed.id) {
        router.push("/feeds");
      }
      fetchSidebar();
    } finally {
      setDeleteLoading(false);
    }
  };

  const fetchSidebar = useCallback(async () => {
    try {
      const res = await fetch("/api/sidebar");
      const data = await res.json();
      if (res.ok && data.data) {
        setCategories(data.data.categories);
        setTotalUnread(data.data.totalUnread);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchSidebar();
    const interval = setInterval(fetchSidebar, 60_000);
    return () => clearInterval(interval);
  }, [fetchSidebar]);

  function toggleCat(id: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-[68px]" : "w-80"
      )}
    >
      {/* Logo */}
      <div className="flex h-[72px] items-center justify-between px-5">
        {!collapsed ? (
          <Link href="/feeds" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/25">
              <Rss className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">
              Feed2040
            </span>
          </Link>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href="/feeds"
                  className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-md shadow-primary/25"
                />
              }
            >
              <Rss className="h-4 w-4 text-primary-foreground" />
            </TooltipTrigger>
            <TooltipContent side="right">Feed2040</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Add Feed button */}
      <div className={cn("px-5 pb-4", collapsed && "px-2")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="default"
                  size="icon"
                  className="h-9 w-full rounded-xl shadow-sm shadow-primary/20"
                  onClick={() => {
                    router.push("/feeds/add");
                    onNavigate?.();
                  }}
                />
              }
            >
              <Plus size={16} />
            </TooltipTrigger>
            <TooltipContent side="right">Add Feed</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="default"
            className="w-full rounded-xl h-11 text-[0.95rem] font-semibold shadow-sm shadow-primary/20"
            onClick={() => {
              router.push("/feeds/add");
              onNavigate?.();
            }}
          >
            <Plus size={18} />
            <span>Add Feed</span>
          </Button>
        )}
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              (pathname === item.href || pathname.startsWith(item.href + "/")) &&
              !activeFeedId &&
              !activeCategoryId;
            const Icon = item.icon;

            const linkClasses = cn(
              "relative flex items-center gap-3.5 rounded-xl px-4 py-3 text-[0.95rem] font-medium transition-all duration-150",
              isActive
                ? "bg-primary/10 text-primary font-semibold"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
              collapsed && "justify-center px-2"
            );

            const linkContent = (
              <>
                {isActive && (
                  <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon size={20} className={cn(isActive && "text-primary")} />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.href === "/feeds" && totalUnread > 0 && (
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-bold text-primary hover:bg-primary/15"
                      >
                        {totalUnread > 999 ? "999+" : totalUnread}
                      </Badge>
                    )}
                  </>
                )}
              </>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger
                    render={
                      <Link href={item.href} onClick={onNavigate} className={linkClasses} />
                    }
                  >
                    {linkContent}
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return (
              <Link key={item.href} href={item.href} onClick={onNavigate} className={linkClasses}>
                {linkContent}
              </Link>
            );
          })}
        </div>

        {/* Categories + Feeds */}
        {!collapsed && categories.length > 0 && (
          <div className="mt-4">
            <Separator className="mb-3 bg-sidebar-border" />
            <p className="mb-2 px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Categories
            </p>
            <div className="space-y-0.5">
              {categories.map((cat) => {
                const isExpanded = expandedCats.has(cat.id);
                const isCatActive = activeCategoryId === cat.id;

                return (
                  <Collapsible
                    key={cat.id}
                    open={isExpanded}
                    onOpenChange={() => toggleCat(cat.id)}
                  >
                    <div className="flex items-center">
                      <CollapsibleTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-sidebar-accent"
                          />
                        }
                      >
                        <ChevronDown
                          size={13}
                          className={cn(
                            "transition-transform duration-200",
                            !isExpanded && "-rotate-90"
                          )}
                        />
                      </CollapsibleTrigger>
                      <Button
                        variant="ghost"
                        className={cn(
                          "h-auto flex-1 justify-start gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium min-w-0",
                          isCatActive
                            ? "bg-primary/10 text-primary hover:bg-primary/15"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                        )}
                        onClick={() => {
                          router.push(`/feeds?categoryId=${cat.id}`);
                          onNavigate?.();
                        }}
                      >
                        <span className="shrink-0 text-sm">{cat.icon || "📁"}</span>
                        <span className="flex-1 truncate text-left">{cat.name}</span>
                        {cat.unread > 0 && (
                          <Badge
                            variant="secondary"
                            className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-bold text-primary hover:bg-primary/15"
                          >
                            {cat.unread}
                          </Badge>
                        )}
                      </Button>
                    </div>

                    <CollapsibleContent>
                      {cat.feeds.length > 0 && (
                        <div className="ml-6 space-y-0.5 py-0.5">
                          {cat.feeds.map((feed) => {
                            const isFeedActive = activeFeedId === feed.id;
                            return (
                              <div key={feed.id} className="group flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  className={cn(
                                    "h-auto flex-1 justify-start gap-2.5 rounded-lg px-2.5 py-2 text-[0.8rem] min-w-0",
                                    isFeedActive
                                      ? "bg-primary/10 text-primary font-medium hover:bg-primary/15"
                                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                                  )}
                                  onClick={() => {
                                    router.push(`/feeds?feedId=${feed.id}`);
                                    onNavigate?.();
                                  }}
                                >
                                  {feed.faviconUrl ? (
                                    <img
                                      src={feed.faviconUrl}
                                      alt=""
                                      className="h-3.5 w-3.5 shrink-0 rounded"
                                    />
                                  ) : (
                                    <Rss size={12} className="shrink-0 opacity-50" />
                                  )}
                                  <span className="flex-1 truncate text-left">{feed.title}</span>
                                  {feed.unread > 0 && (
                                    <span className="shrink-0 text-[10px] font-semibold text-primary/70">
                                      {feed.unread}
                                    </span>
                                  )}
                                </Button>
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
          </div>
        )}

        {/* Collapsed: categories expand icon */}
        {collapsed && categories.length > 0 && (
          <div className="mt-4 flex justify-center">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl text-sidebar-foreground hover:bg-sidebar-accent"
                    onClick={() => setCollapsed(false)}
                  />
                }
              >
                <FolderOpen size={18} />
              </TooltipTrigger>
              <TooltipContent side="right">Expand to see categories</TooltipContent>
            </Tooltip>
          </div>
        )}

        {!collapsed && (
          <div className="mt-4">
            <Separator className="mb-3 bg-sidebar-border" />
            <p className="mb-2 px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Integrations
            </p>
            <Link
              href="/settings?tab=ai"
              className="flex items-center gap-3.5 rounded-xl px-4 py-2.5 text-[0.9rem] font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
            >
              <Sparkles size={20} />
              <span>AI Settings</span>
            </Link>
            <Link
              href="/settings?tab=telegram"
              className="flex items-center gap-3.5 rounded-xl px-4 py-2.5 text-[0.9rem] font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
            >
              <Bot size={20} />
              <span>Telegram Bot</span>
            </Link>
          </div>
        )}
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      {/* Footer */}
      <div className="space-y-2 p-4">
        <div className={cn(collapsed && "flex justify-center")}>
          <ThemeToggle collapsed={collapsed} />
        </div>
        <Button
          variant="ghost"
          className={cn(
            "h-auto w-full justify-start gap-3 rounded-xl px-3.5 py-2.5 text-[0.9rem] text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
            collapsed && "justify-center px-2"
          )}
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          {session?.user?.name ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
              {session.user.name.charAt(0).toUpperCase()}
            </div>
          ) : (
            <User size={16} />
          )}
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left">
                {session?.user?.name || "Sign Out"}
              </span>
              <LogOut size={14} className="text-muted-foreground" />
            </>
          )}
        </Button>
      </div>

      <Separator className="bg-sidebar-border" />

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-full rounded-none text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              onClick={() => setCollapsed(!collapsed)}
            />
          }
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </TooltipTrigger>
        <TooltipContent side="right">
          {collapsed ? "Expand sidebar" : "Collapse sidebar"}
        </TooltipContent>
      </Tooltip>

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
