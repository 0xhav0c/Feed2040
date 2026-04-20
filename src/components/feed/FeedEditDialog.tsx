"use client";

import { useState, useEffect, useRef } from "react";
import { X, ExternalLink, Loader2, AlertTriangle, Clock, Rss } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const INTERVAL_OPTIONS = [
  { value: 0, label: "Use global setting" },
  { value: 5, label: "Every 5 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every 1 hour" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Once a day" },
];

type FeedMeta = {
  url: string;
  siteUrl: string | null;
  description: string | null;
  language: string | null;
  lastFetched: string | null;
  fetchError: string | null;
  errorCount: number;
  createdAt: string;
  _count: { articles: number };
  categories: { category: { id: string; name: string } }[];
};

type FeedEditDialogProps = {
  open: boolean;
  feedId: string;
  initialTitle: string;
  onSave: (id: string, title: string, options?: { scrapeFullText?: boolean; refreshInterval?: number | null }) => Promise<void>;
  onClose: () => void;
};

export function FeedEditDialog({ open, feedId, initialTitle, onSave, onClose }: FeedEditDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [scrapeFullText, setScrapeFullText] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [meta, setMeta] = useState<FeedMeta | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setLoadingMeta(true);
      setMeta(null);
      fetch(`/api/feeds/${feedId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.data) {
            setScrapeFullText(d.data.scrapeFullText ?? false);
            setRefreshInterval(d.data.refreshInterval ?? 0);
            setMeta(d.data);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingMeta(false));
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [open, initialTitle, feedId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(feedId, title.trim(), {
        scrapeFullText,
        refreshInterval: refreshInterval || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4 rounded-t-2xl">
          <h3 className="text-base font-semibold text-foreground">Edit Feed</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {loadingMeta ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Feed info */}
            {meta && (
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Rss size={12} />
                  <a
                    href={meta.siteUrl || meta.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground transition-colors truncate flex items-center gap-1"
                  >
                    {meta.url}
                    <ExternalLink size={10} />
                  </a>
                </div>
                <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span>{meta._count.articles} articles</span>
                  {meta.language && <span>Language: {meta.language}</span>}
                  {meta.lastFetched && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      Last fetched {formatDistanceToNow(new Date(meta.lastFetched), { addSuffix: true })}
                    </span>
                  )}
                </div>
                {meta.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {meta.categories.map((c) => (
                      <span key={c.category.id} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {c.category.name}
                      </span>
                    ))}
                  </div>
                )}
                {meta.fetchError && (
                  <div className="flex items-start gap-2 mt-2 rounded-lg bg-destructive/10 p-2">
                    <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-medium text-destructive">Fetch Error ({meta.errorCount} consecutive)</p>
                      <p className="text-[10px] text-destructive/80 break-all">{meta.fetchError}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Feed Title</label>
              <input
                ref={inputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                maxLength={200}
              />
            </div>

            {/* Full-text scraping */}
            <div className="flex items-center justify-between rounded-xl border border-border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Full-text scraping</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Automatically fetch full article content from the source website when RSS provides only a summary
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={scrapeFullText}
                onClick={() => setScrapeFullText((v) => !v)}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ml-4 ${scrapeFullText ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${scrapeFullText ? "translate-x-5" : ""}`} />
              </button>
            </div>

            {/* Refresh Interval */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Refresh Interval</label>
              <p className="text-[10px] text-muted-foreground mt-0.5 mb-1.5">How often this feed should be checked for new articles</p>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(parseInt(e.target.value, 10))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !title.trim()}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
