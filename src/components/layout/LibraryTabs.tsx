import Link from "next/link";
import { Bookmark, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Library = bookmarked articles (/bookmarks) + saved links (/feeds?saved=1).
 * Both used to be separate sidebar entries for the same "read later" intent.
 */
export function LibraryTabs({ active }: { active: "bookmarks" | "saved" }) {
  const tabs = [
    { key: "bookmarks", href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
    { key: "saved", href: "/feeds?saved=1", label: "Saved links", icon: Link2 },
  ] as const;
  return (
    <div role="tablist" aria-label="Library" className="inline-flex rounded-[9px] border border-border bg-background p-[3px]">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={active === t.key}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors",
            active === t.key ? "bg-muted text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <t.icon size={13} aria-hidden />
          {t.label}
        </Link>
      ))}
    </div>
  );
}
