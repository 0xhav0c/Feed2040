"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bookmark,
  CircleDot,
  FolderTree,
  LayoutDashboard,
  Library,
  Plus,
  Rss,
  Search,
  Settings,
  Sparkles,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const OPEN_COMMAND_PALETTE = "command-palette:open";

type Item = {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  href: string;
  color?: string | null;
  group: "Go to" | "Categories" | "Feeds" | "Search";
};

const PAGES: Item[] = [
  { id: "p-feeds", label: "All Feeds", icon: Rss, href: "/feeds", group: "Go to" },
  { id: "p-unread", label: "Unread", icon: CircleDot, href: "/feeds?filter=unread", group: "Go to" },
  { id: "p-today", label: "Today", icon: CalendarDays, href: "/feeds?filter=today", group: "Go to" },
  { id: "p-brief", label: "Daily Briefing", icon: Sparkles, href: "/briefing", group: "Go to" },
  { id: "p-lib", label: "Library · Bookmarks", icon: Bookmark, href: "/bookmarks", group: "Go to" },
  { id: "p-saved", label: "Library · Saved links", icon: Library, href: "/feeds?saved=1", group: "Go to" },
  { id: "p-over", label: "Overview", icon: LayoutDashboard, href: "/dashboard", group: "Go to" },
  { id: "p-add", label: "Add feed", icon: Plus, href: "/feeds/add", group: "Go to" },
  { id: "p-cats", label: "Manage categories", icon: FolderTree, href: "/categories", group: "Go to" },
  { id: "p-set", label: "Settings", icon: Settings, href: "/settings", group: "Go to" },
];

type SidebarData = {
  categories: { id: string; name: string; color: string | null; unread: number; feeds: { id: string; title: string; unread: number }[] }[];
};

function normalize(s: string) {
  return s.toLocaleLowerCase("tr").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/** ⌘K / Ctrl+K: jump to any page, category or feed, or search articles. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [data, setData] = useState<SidebarData | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
    fetch("/api/sidebar")
      .then((r) => r.json())
      .then((d) => d.data && setData(d.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE, show);
    };
  }, [show]);

  const items = useMemo(() => {
    const all: Item[] = [...PAGES];
    const seenFeeds = new Set<string>();
    for (const c of data?.categories ?? []) {
      all.push({
        id: `c-${c.id}`,
        label: c.name,
        hint: c.unread ? `${c.unread} unread` : undefined,
        icon: FolderTree,
        color: c.color,
        href: `/feeds?categoryId=${c.id}`,
        group: "Categories",
      });
      for (const f of c.feeds) {
        if (seenFeeds.has(f.id)) continue;
        seenFeeds.add(f.id);
        all.push({
          id: `f-${f.id}`,
          label: f.title,
          hint: f.unread ? `${f.unread} unread` : undefined,
          icon: Rss,
          href: `/feeds?feedId=${f.id}`,
          group: "Feeds",
        });
      }
    }
    const q = normalize(query.trim());
    const matches = q
      ? all.filter((i) => normalize(i.label).includes(q))
      : all.filter((i) => i.group !== "Feeds");
    const capped = [
      ...matches.filter((i) => i.group !== "Feeds"),
      ...matches.filter((i) => i.group === "Feeds").slice(0, 30),
    ];
    if (query.trim()) {
      capped.unshift({
        id: "search",
        label: `Search articles for “${query.trim()}”`,
        icon: Search,
        href: `/feeds?q=${encodeURIComponent(query.trim())}`,
        group: "Search",
      });
    }
    return capped;
  }, [data, query]);

  const go = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router]
  );

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] translate-y-0 gap-0 overflow-hidden bg-popover p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search or jump to</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search size={18} className="shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[active]);
              }
            }}
            placeholder="Search or jump to…"
            aria-label="Search or jump to"
            className="h-14 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">Esc</kbd>
        </div>
        <div ref={listRef} role="listbox" aria-label="Results" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matches</p>
          )}
          {items.map((item, index) => {
            const header = item.group !== lastGroup && item.group !== "Search" ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {header && (
                  <p className="px-3 pb-1 pt-3 text-[11.5px] font-medium text-muted-foreground">{header}</p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(item)}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors",
                    index === active ? "bg-accent text-foreground" : "text-foreground/90"
                  )}
                >
                  {item.color ? (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
                  ) : (
                    <Icon size={16} className={cn("shrink-0", index === active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="text-xs text-muted-foreground tabular-nums">{item.hint}</span>}
                  {index === active && <ArrowRight size={14} className="text-muted-foreground" aria-hidden />}
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
