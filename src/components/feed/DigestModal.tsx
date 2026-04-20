"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Sparkles, Loader2, Clock, History, RefreshCw, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { DigestView, type StructuredDigestResult } from "./DigestView";

type DigestModalProps = {
  open: boolean;
  onClose: () => void;
};

type CategoryOption = { id: string; name: string };

const HOUR_OPTIONS = [
  { value: 12, label: "Last 12 hours" },
  { value: 24, label: "Last 24 hours" },
  { value: 48, label: "Last 48 hours" },
  { value: 72, label: "Last 3 days" },
  { value: 168, label: "Last 7 days" },
];

export function DigestModal({ open, onClose }: DigestModalProps) {
  const [results, setResults] = useState<StructuredDigestResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [isCached, setIsCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/sidebar")
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.categories) {
          setCategories(
            d.data.categories.map((c: { id: string; name: string }) => ({
              id: c.id, name: c.name,
            }))
          );
        }
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (results) return;
    loadCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function loadCached() {
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
      }
    } catch { /* no cache */ }
    finally { setInitialLoading(false); }
  }

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  const generate = useCallback(
    async (h: number, forceRefresh = false) => {
      setLoading(true);
      setError(null);
      setResults(null);
      setIsCached(false);
      setCachedAt(null);
      try {
        const payload: Record<string, unknown> = { hours: h, forceRefresh };
        if (selectedCategories.length > 0) {
          payload.categoryIds = selectedCategories;
        }
        const res = await fetch("/api/ai/daily-digest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Briefing generation failed");
          return;
        }
        setResults(data.data?.structured || null);
        setIsCached(data.data?.cached || false);
        setCachedAt(data.data?.createdAt || null);
      } catch {
        setError("Connection error");
      } finally {
        setLoading(false);
      }
    },
    [selectedCategories]
  );

  function formatCachedTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 mt-6 mb-6 flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-border bg-background shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">AI-Powered Daily Briefing</h2>
              <p className="text-[11px] text-muted-foreground">Generate intelligent summaries from your feeds</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Controls */}
        <div className="border-b border-border px-6 py-4 shrink-0 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Time Range */}
            <div className="flex items-center gap-1.5">
              <Clock size={13} className="text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Time range:</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {HOUR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setHours(opt.value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    hours === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="flex items-start gap-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 shrink-0 mt-1">
                <Filter size={13} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Category filter</span>
                <span className="text-[10px] text-muted-foreground/60">(empty = all)</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {categories.map((cat) => {
                  const selected = selectedCategories.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => toggleCategory(cat.id)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => generate(hours)}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {loading ? "Generating..." : "Generate Briefing"}
            </button>

            {results && (
              <button
                onClick={() => generate(hours, true)}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-all"
                title="Regenerate"
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Cache indicator */}
        {isCached && cachedAt && !loading && (
          <div className="flex items-center gap-2 border-b border-border px-6 py-2 bg-muted/30 shrink-0">
            <History size={12} className="text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground">
              Showing briefing generated at <span className="font-semibold">{formatCachedTime(cachedAt)}</span> today.{" "}
              <button onClick={() => generate(hours, true)} className="text-primary hover:underline font-medium">
                Click to regenerate.
              </button>
            </p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {initialLoading ? (
            <DigestView results={null} loading={true} />
          ) : (
            <DigestView results={results} loading={loading} error={error} />
          )}
        </div>
      </div>
    </div>
  );
}
