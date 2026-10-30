"use client";

import { cn } from "@/lib/utils";
import {
  LayoutList,
  LayoutGrid,
  Newspaper,
} from "lucide-react";
import type { ViewMode } from "@/types";
import { VIEW_MODES } from "@/types";

type HeaderProps = {
  title: string;
  subtitle?: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  actions?: React.ReactNode;
};

const VIEW_OPTIONS = [
  { mode: VIEW_MODES.List, icon: LayoutList, label: "List" },
  { mode: VIEW_MODES.Card, icon: LayoutGrid, label: "Card" },
  { mode: VIEW_MODES.Magazine, icon: Newspaper, label: "Magazine" },
] as const;

export function Header({
  title,
  subtitle,
  viewMode = "list",
  onViewModeChange,
  actions,
}: HeaderProps) {
  return (
    <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {onViewModeChange && (
          <div className="mr-1 flex items-center rounded-[9px] border border-border bg-background p-[3px]" role="group" aria-label="View mode">
            {VIEW_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.mode}
                  onClick={() => onViewModeChange(option.mode)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                    viewMode === option.mode
                      ? "bg-muted text-foreground ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={option.label}
                  aria-label={`${option.label} view`}
                  aria-pressed={viewMode === option.mode}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
        )}

        {actions}
      </div>
    </header>
  );
}
