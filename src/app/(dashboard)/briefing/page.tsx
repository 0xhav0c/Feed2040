"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import {
  DigestView,
  type StructuredDigestResult,
} from "@/components/feed/DigestView";
import {
  Sparkles, Loader2, Clock, Filter, RefreshCw, History,
  ChevronRight, Calendar, Trash2, Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const HOUR_OPTIONS = [
  { value: 12, label: "12h" },
  { value: 24, label: "24h" },
  { value: 48, label: "48h" },
  { value: 72, label: "3d" },
  { value: 168, label: "7d" },
];

type CategoryOption = { id: string; name: string };

type DigestHistoryItem = {
  id: string;
  date: string;
  hours: number;
  source: string;
  createdAt: string;
  itemCount: number;
};

type DateGroup = {
  date: string;
  label: string;
  items: DigestHistoryItem[];
};

const SOURCE_LABELS: Record<string, string> = {
  web: "Manual",
  scheduled: "Scheduled",
  telegram: "Telegram",
};

const SOURCE_COLORS: Record<string, string> = {
  web: "text-blue-500",
  scheduled: "text-green-500",
  telegram: "text-purple-500",
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function groupByDate(items: DigestHistoryItem[]): DateGroup[] {
  const map = new Map<string, DigestHistoryItem[]>();
  for (const item of items) {
    const existing = map.get(item.date) || [];
    existing.push(item);
    map.set(item.date, existing);
  }
  return Array.from(map.entries()).map(([date, items]) => ({
    date,
    label: formatDateLabel(date),
    items: items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  }));
}

export default function BriefingPage() {
  const [results, setResults] = useState<StructuredDigestResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCached, setIsCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [activeDigestId, setActiveDigestId] = useState<string | null>(null);

  const [history, setHistory] = useState<DigestHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) {
          const flat: CategoryOption[] = [];
          const collect = (c: { id: string; name: string; children?: unknown[] }) => {
            flat.push({ id: c.id, name: c.name });
            if (Array.isArray(c.children)) {
              for (const ch of c.children) {
                collect(ch as { id: string; name: string; children?: unknown[] });
              }
            }
          };
          (Array.isArray(data.data) ? data.data : []).forEach(collect);
          setCategories(flat);
        }
      })
      .catch(() => {});
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/ai/daily-digest/history?limit=50");
      const data = await res.json();
      if (res.ok && data.data) {
        setHistory(data.data);
      }
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    loadCachedDigest();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCachedDigest() {
    setInitialLoading(true);
    try {
      const res = await fetch("/api/ai/daily-digest?date=" + new Date().toISOString().slice(0, 10));
      const data = await res.json();
      if (res.ok && data.data?.length > 0) {
        const latest = data.data[0];
        setResults(latest.structured as StructuredDigestResult[]);
        setIsCached(true);
        setCachedAt(latest.createdAt);
        setHours(latest.hours || 24);
        setActiveDigestId(latest.id);
      }
    } catch {
      // no cached digest
    } finally {
      setInitialLoading(false);
    }
  }

  async function loadDigestById(id: string) {
    setLoading(true);
    setError(null);
    setActiveDigestId(id);
    try {
      const res = await fetch(`/api/ai/daily-digest/${id}`);
      const data = await res.json();
      if (res.ok && data.data) {
        setResults(data.data.structured as StructuredDigestResult[]);
        setIsCached(true);
        setCachedAt(data.data.createdAt);
        setHours(data.data.hours || 24);
      } else {
        setError(data.error || "Failed to load briefing");
      }
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteDigest(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/ai/daily-digest/${id}`, { method: "DELETE" });
      if (res.ok) {
        setHistory((prev) => prev.filter((d) => d.id !== id));
        if (activeDigestId === id) {
          setResults(null);
          setActiveDigestId(null);
        }
      }
    } catch {
      // silent
    }
  }

  const [generatingPlaceholderId] = useState(() => `generating-${Date.now()}`);

  const generate = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setResults(null);
    setIsCached(false);
    setCachedAt(null);
    setActiveDigestId(generatingPlaceholderId);

    const placeholder: DigestHistoryItem = {
      id: generatingPlaceholderId,
      date: new Date().toISOString().slice(0, 10),
      hours,
      source: "web",
      createdAt: new Date().toISOString(),
      itemCount: -1,
    };
    setHistory((prev) => [placeholder, ...prev.filter((h) => h.id !== generatingPlaceholderId)]);

    try {
      const body: Record<string, unknown> = { hours, forceRefresh };
      if (selectedCategories.length > 0) {
        body.categoryIds = selectedCategories;
      }
      const res = await fetch("/api/ai/daily-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Briefing generation failed");
        setHistory((prev) => prev.filter((h) => h.id !== generatingPlaceholderId));
        return;
      }
      setResults(data.data?.structured || null);
      setIsCached(data.data?.cached || false);
      setCachedAt(data.data?.createdAt || null);
      setActiveDigestId(data.data?.id || null);
      loadHistory();
    } catch {
      setError("Connection error");
      setHistory((prev) => prev.filter((h) => h.id !== generatingPlaceholderId));
    } finally {
      setLoading(false);
    }
  }, [hours, selectedCategories, loadHistory, generatingPlaceholderId]);

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  const dateGroups = groupByDate(history);

  return (
    <>
      <Header title="Daily Briefing" subtitle="AI-powered daily digest" />
      <div className="flex flex-1 overflow-hidden">
        {/* Archive Sidebar */}
        <div
          className={cn(
            "flex-shrink-0 border-r border-border bg-card/50 flex flex-col transition-all duration-200 overflow-hidden",
            showArchive ? "w-64" : "w-0 lg:w-64"
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Archive size={15} />
              Archive
            </div>
            <span className="text-xs text-muted-foreground">{history.length}</span>
          </div>

          <ScrollArea className="flex-1">
            {historyLoading ? (
              <div className="flex flex-col gap-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : dateGroups.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-muted-foreground">No briefings yet</p>
              </div>
            ) : (
              dateGroups.map((group) => (
                <div key={group.date}>
                  <div className="sticky top-0 bg-card/90 backdrop-blur-sm px-4 py-2 border-b border-border/50">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={11} className="text-muted-foreground" />
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {group.label}
                      </span>
                    </div>
                  </div>
                  {group.items.map((item) => {
                    const isActive = activeDigestId === item.id;
                    const isGenerating = item.itemCount === -1;
                    return (
                      <button
                        key={item.id}
                        onClick={() => !isGenerating && loadDigestById(item.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors group",
                          isGenerating && "animate-pulse cursor-wait",
                          isActive
                            ? "bg-primary/10 border-r-2 border-primary"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isGenerating ? (
                              <>
                                <Loader2 size={12} className="animate-spin text-primary" />
                                <span className="text-xs font-medium text-primary">
                                  Generating...
                                </span>
                              </>
                            ) : (
                              <>
                                <span className={cn("text-xs font-medium", isActive ? "text-primary" : "text-foreground")}>
                                  {formatTime(item.createdAt)}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0 h-4 font-normal",
                                    SOURCE_COLORS[item.source] || "text-muted-foreground"
                                  )}
                                >
                                  {SOURCE_LABELS[item.source] || item.source}
                                </Badge>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isGenerating ? (
                              <span className="text-[10px] text-muted-foreground">
                                AI is analyzing articles...
                              </span>
                            ) : (
                              <>
                                <span className="text-[10px] text-muted-foreground">
                                  {item.itemCount} items
                                </span>
                                <span className="text-[10px] text-muted-foreground/50">·</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {item.hours}h range
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {!isGenerating && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={(e) => deleteDigest(item.id, e)}
                                className="opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </Button>
                              <ChevronRight size={12} className={cn(
                                "text-muted-foreground/30",
                                isActive && "text-primary"
                              )} />
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Mobile archive toggle */}
          <div className="lg:hidden p-3 border-b border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowArchive(!showArchive)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Archive size={14} />
              {showArchive ? "Hide" : "Show"} Archive ({history.length})
            </Button>
          </div>

          <div className="mx-auto max-w-6xl p-6 space-y-6">
            {/* Controls Card */}
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles size={16} className="text-primary" />
                  Generate AI-powered daily briefing
                </div>

                <Separator />

                {/* Time Range + Actions on same row for compactness */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Range:</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {HOUR_OPTIONS.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={hours === opt.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setHours(opt.value)}
                        className="text-xs"
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Category Filter */}
                {categories.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Filter size={13} className="text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Categories{" "}
                        <span className="text-muted-foreground/60">(empty = all)</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((cat) => {
                        const sel = selectedCategories.includes(cat.id);
                        return (
                          <Badge
                            key={cat.id}
                            variant={sel ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => toggleCategory(cat.id)}
                          >
                            {cat.name}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => generate(false)}
                    disabled={loading}
                    variant="default"
                    className="flex-1"
                  >
                    {loading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    {loading ? "Generating..." : "Generate Briefing"}
                  </Button>

                  {results && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => generate(true)}
                      disabled={loading}
                      title="Regenerate (skip cache)"
                    >
                      <RefreshCw size={16} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Cache indicator */}
            {isCached && cachedAt && !loading && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-2">
                <History size={13} className="text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Generated at <span className="font-medium text-foreground">{formatTime(cachedAt)}</span>.{" "}
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => generate(true)}
                    className="text-primary h-auto p-0 font-medium"
                  >
                    Regenerate
                  </Button>
                </p>
              </div>
            )}

            {/* Digest Content */}
            {initialLoading ? (
              <DigestView results={null} loading={true} />
            ) : (
              <DigestView results={results} loading={loading} error={error} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
