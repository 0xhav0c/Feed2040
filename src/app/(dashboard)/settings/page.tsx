"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowDownUp,
  Bell,
  Loader2,
  Newspaper,
  Rss,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { cn } from "@/lib/utils";
import { AccountSection } from "@/components/settings/AccountSection";
import { FeedsSection } from "@/components/settings/FeedsSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { AiSection } from "@/components/settings/AiSection";
import { BriefingSection } from "@/components/settings/BriefingSection";
import { DataSection } from "@/components/settings/DataSection";
import { FeverSection } from "@/components/settings/FeverSection";
import { UsersAdminTab } from "@/components/settings/UsersAdminTab";

type Section = {
  id: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  group: string;
  adminOnly?: boolean;
};

const SECTIONS: Section[] = [
  { id: "account", label: "Account", title: "Account", description: "Your profile, password and reading preferences.", icon: UserRound, group: "General" },
  { id: "feeds", label: "Feeds", title: "Feeds", description: "How often feeds refresh, how long articles are kept, and feeds that are failing.", icon: Rss, group: "General" },
  { id: "notifications", label: "Notifications", title: "Notifications", description: "Keyword alerts, browser notifications and Telegram.", icon: Bell, group: "General" },
  { id: "ai", label: "AI provider", title: "AI provider", description: "The AI service behind summaries, Ask AI, translation fallback and briefings.", icon: Sparkles, group: "AI" },
  { id: "briefing", label: "Daily briefing", title: "Daily briefing", description: "When briefings are written and where they're delivered.", icon: Newspaper, group: "AI" },
  { id: "data", label: "Import & export", title: "Import & export", description: "Bring feeds in from another reader or take a backup.", icon: ArrowDownUp, group: "Data" },
  { id: "fever", label: "Reader apps", title: "Reader apps", description: "Read Feed2040 from mobile and desktop RSS apps.", icon: Smartphone, group: "Data" },
  { id: "users", label: "Users", title: "Users", description: "Accounts on this server and who can sign up.", icon: Users, group: "Admin", adminOnly: true },
];

// Old ?tab= values keep working after the reorganisation.
const LEGACY: Record<string, string> = { general: "account", telegram: "notifications" };

function SettingsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  const requested = searchParams.get("tab") || "account";
  const resolved = LEGACY[requested] ?? requested;
  const active = sections.some((s) => s.id === resolved) ? resolved : "account";
  const current = sections.find((s) => s.id === active)!;

  // Sections stay mounted once opened so unsaved edits survive switching.
  const [visited, setVisited] = useState<string[]>([active]);
  useEffect(() => {
    setVisited((v) => (v.includes(active) ? v : [...v, active]));
  }, [active]);

  useEffect(() => {
    document.title = `${current.title} · Settings | Feed2040`;
  }, [current.title]);

  const go = useCallback(
    (id: string) => {
      router.replace(`${pathname}?tab=${id}`, { scroll: false });
      document.getElementById("settings-scroll")?.scrollTo({ top: 0 });
    },
    [router, pathname]
  );

  const groups = sections.reduce<Record<string, Section[]>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});

  function render(id: string) {
    switch (id) {
      case "account":
        return <AccountSection />;
      case "feeds":
        return <FeedsSection isAdmin={isAdmin} />;
      case "notifications":
        return <NotificationsSection onNavigate={go} />;
      case "ai":
        return <AiSection />;
      case "briefing":
        return <BriefingSection active={active === "briefing"} onNavigate={go} />;
      case "data":
        return <DataSection />;
      case "fever":
        return <FeverSection />;
      case "users":
        return session?.user?.id ? <UsersAdminTab currentUserId={session.user.id} /> : null;
      default:
        return null;
    }
  }

  return (
    <>
      <Header title="Settings" />
      <div className="flex flex-1 overflow-hidden">
        <nav aria-label="Settings sections" className="hidden w-56 shrink-0 overflow-y-auto border-r border-border px-3 py-5 md:block">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="mb-5">
              <p className="px-3 pb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">{group}</p>
              <ul className="space-y-0.5">
                {items.map((s) => {
                  const on = s.id === active;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => go(s.id)}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                          "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                          on ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                        )}
                      >
                        <s.icon size={16} className={cn("shrink-0", on && "text-primary")} aria-hidden />
                        {s.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div id="settings-scroll" className="flex-1 overflow-y-auto">
          <nav
            aria-label="Settings sections"
            className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur md:hidden"
          >
            {sections.map((s) => {
              const on = s.id === active;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-colors",
                    on ? "border-primary/50 bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground"
                  )}
                >
                  <s.icon size={14} aria-hidden />
                  {s.label}
                </button>
              );
            })}
          </nav>

          <div className="px-4 py-6 md:px-8 md:py-8">
            <header className="mb-6">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">{current.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
            </header>
            {sections
              .filter((s) => visited.includes(s.id))
              .map((s) => (
                <div key={s.id} hidden={s.id !== active}>
                  {render(s.id)}
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading settings" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
