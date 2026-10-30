"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Library, Menu, Rss, Sparkles } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Suspense } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden md:flex md:flex-col">
        <Sidebar />
      </aside>

      {/* Mobile: the full sidebar (categories, tags, searches) lives in a sheet
          opened from the tab bar's "Menu" tab. */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[280px] p-0 sm:max-w-[280px]" side="left" showCloseButton={false}>
          <Sidebar onNavigate={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="relative flex flex-1 flex-col overflow-hidden pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      <Suspense fallback={null}>
        <MobileTabBar onMenu={() => setSheetOpen(true)} />
      </Suspense>
      <CommandPalette />
    </div>
  );
}

function MobileTabBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const saved = params.get("saved") === "1";
  const tabs = [
    { href: "/feeds", label: "Feeds", icon: Rss, active: pathname === "/feeds" && !saved },
    { href: "/briefing", label: "Briefing", icon: Sparkles, active: pathname.startsWith("/briefing") },
    { href: "/bookmarks", label: "Library", icon: Library, active: pathname.startsWith("/bookmarks") || saved },
  ];
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
            t.active ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <t.icon size={20} className={cn(t.active && "text-primary")} aria-hidden />
          {t.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={onMenu}
        className="flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
      >
        <Menu size={20} aria-hidden />
        Menu
      </button>
    </nav>
  );
}
