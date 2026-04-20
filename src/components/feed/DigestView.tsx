"use client";

import { cn } from "@/lib/utils";
import {
  ExternalLink,
  Sparkles,
  FileQuestion,
  AlertTriangle,
  Newspaper,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export interface DigestItem {
  emoji: string;
  headline: string;
  summary: string;
  impact: "critical" | "high" | "medium" | "low" | "info";
  url: string;
  tags: string[];
}

export interface StructuredDigestResult {
  categoryName: string;
  isVuln: boolean;
  items: DigestItem[];
  totalArticles: number;
  filteredArticles?: number;
}

type DigestViewProps = {
  results: StructuredDigestResult[] | null;
  loading?: boolean;
  error?: string | null;
};

const IMPACT_CONFIG: Record<
  string,
  { emoji: string; label: string; className: string; badgeClass: string }
> = {
  critical: {
    emoji: "🔴",
    label: "CRITICAL",
    className: "border-l-red-500",
    badgeClass: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  high: {
    emoji: "🟠",
    label: "HIGH",
    className: "border-l-orange-500",
    badgeClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  medium: {
    emoji: "🟡",
    label: "MEDIUM",
    className: "border-l-yellow-500",
    badgeClass: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  },
  low: {
    emoji: "🔵",
    label: "LOW",
    className: "border-l-blue-500",
    badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  info: {
    emoji: "⚪",
    label: "INFO",
    className: "border-l-slate-400",
    badgeClass: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  },
};

export function DigestView({ results, loading, error }: DigestViewProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle size={24} className="text-destructive" />
        </div>
        <p className="font-medium text-foreground">Briefing generation failed</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileQuestion size={24} className="text-muted-foreground" />
        </div>
        <p className="font-medium text-foreground">No briefing yet</p>
        <p className="text-sm text-muted-foreground">Use the button above to generate a briefing</p>
      </div>
    );
  }

  let totalItems = 0;
  let totalArticles = 0;
  let totalFiltered = 0;
  for (const r of results) {
    totalItems += r.items.length;
    totalArticles += r.totalArticles;
    totalFiltered += r.filteredArticles || 0;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    day: "numeric", month: "long", year: "numeric", weekday: "long",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Newspaper size={20} className="text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Daily Briefing</h2>
          <p className="text-xs text-muted-foreground">{dateStr}</p>
        </div>
      </div>

      {/* Sections */}
      {results.map((section, sIdx) => (
        <div key={sIdx} className="space-y-4">
          {/* Section Header */}
          <div className="flex items-center gap-2">
            <span className="text-lg">{section.isVuln ? "🛡️" : "📌"}</span>
            <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
              {section.categoryName}
            </h3>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {section.totalArticles} scanned
              {section.filteredArticles ? ` → ${section.filteredArticles} important` : ""}
              {" → "}{section.items.length} items
            </span>
          </div>

          {/* Items Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {section.items.map((item, iIdx) => {
              const config = IMPACT_CONFIG[item.impact] || IMPACT_CONFIG.info;

              return (
                <Card
                  key={iIdx}
                  className={cn(
                    "border-l-4 transition-colors hover:bg-muted/30",
                    config.className
                  )}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-sm shrink-0">{config.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm text-foreground leading-snug">
                            {item.headline}
                          </h4>
                          <Badge variant="secondary" className={config.badgeClass}>
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                          {item.summary}
                        </p>

                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          {item.tags.slice(0, 4).map((tag, tIdx) => (
                            <Badge key={tIdx} variant="outline" className="text-[10px]">
                              #{tag}
                            </Badge>
                          ))}
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline ml-auto shrink-0"
                            >
                              <ExternalLink size={10} /> Source
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Footer Stats */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <Sparkles size={14} className="text-primary" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{totalArticles}</span> articles scanned
          {totalFiltered > 0 && (
            <>, <span className="font-semibold text-foreground">{totalFiltered}</span> found important</>
          )}
          , <span className="font-semibold text-foreground">{totalItems}</span> items summarized
        </p>
      </div>
    </div>
  );
}
