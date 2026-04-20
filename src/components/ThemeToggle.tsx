"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";
import { cn } from "@/lib/utils";

const THEMES = [
  { id: "light" as const, icon: Sun, label: "Light" },
  { id: "dark" as const, icon: Moon, label: "Dark" },
  { id: "system" as const, icon: Monitor, label: "System" },
];

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (collapsed) {
    // Cycle through themes on click
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
    return (
      <button
        onClick={() => setTheme(next)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        title={`Theme: ${theme}`}
      >
        <Icon size={16} />
      </button>
    );
  }

  return (
    <div className="flex items-center rounded-lg bg-sidebar-accent/60 p-0.5">
      {THEMES.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-all",
              theme === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={t.label}
          >
            <Icon size={12} />
          </button>
        );
      })}
    </div>
  );
}
