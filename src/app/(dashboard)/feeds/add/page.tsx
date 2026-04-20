"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Rss,
  Search,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  Globe,
  Clock,
  FileText,
  Plus,
  ChevronRight,
  ExternalLink,
  FolderTree,
  AlertCircle,
  Upload,
  XCircle,
  Sparkles,
} from "lucide-react";
import type { FeedPreview, CategoryBasic } from "@/types";

// ─── Types ───────────────────────────────────────────────────────────
type OpmlFeed = {
  id: number;
  title: string;
  url: string;
  siteUrl: string | null;
  category: string;
};

type ImportLogEntry = {
  title: string;
  status: "success" | "skipped" | "failed";
  message?: string;
};

// ─── Step indicator ───────────────────────────────────────────────────
function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    { num: 1, label: "Enter URL" },
    { num: 2, label: "Preview" },
    { num: 3, label: "Categorize" },
  ];

  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all",
              currentStep >= step.num
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "bg-muted text-muted-foreground"
            )}
          >
            {currentStep > step.num ? <CheckCircle2 size={16} /> : step.num}
          </div>
          <span
            className={cn(
              "text-sm font-medium hidden sm:inline",
              currentStep >= step.num ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <ChevronRight size={14} className="mx-1 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Preview article card ─────────────────────────────────────────────
function PreviewArticle({
  title,
  author,
  publishedAt,
}: {
  title: string;
  author: string | null;
  publishedAt: Date | null;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
      <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">
          {title}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {author && <span>{author}</span>}
          {author && publishedAt && <span>·</span>}
          {publishedAt && (
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {new Date(publishedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────
export default function AddFeedPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<FeedPreview | null>(null);
  const [error, setError] = useState("");

  // Category selection
  const [categories, setCategories] = useState<CategoryBasic[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Adding feed
  const [adding, setAdding] = useState(false);

  // OPML import
  const [opmlMode, setOpmlMode] = useState(false);
  const [opmlFeeds, setOpmlFeeds] = useState<OpmlFeed[]>([]);
  const [opmlParsing, setOpmlParsing] = useState(false);
  const [opmlUrlMode, setOpmlUrlMode] = useState(false);
  const [opmlUrl, setOpmlUrl] = useState("");
  const [opmlImporting, setOpmlImporting] = useState(false);
  const [opmlActive, setOpmlActive] = useState<Map<number, string>>(new Map());
  const [opmlStats, setOpmlStats] = useState({ success: 0, skipped: 0, failed: 0 });
  const [opmlLog, setOpmlLog] = useState<ImportLogEntry[]>([]);
  const [opmlDone, setOpmlDone] = useState(false);
  const abortRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      const data = await res.json();
      if (res.ok) setCategories(data.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Fetch AI category suggestions when entering step 3
  useEffect(() => {
    if (step !== 3 || !preview) return;
    setLoadingSuggestions(true);
    setAiSuggestions([]);
    fetch("/api/ai/suggest-category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedTitle: preview.title,
        feedDescription: preview.description || "",
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.suggestions) setAiSuggestions(d.data.suggestions);
      })
      .catch(() => {})
      .finally(() => setLoadingSuggestions(false));
  }, [step, preview?.title, preview?.description]);

  // ─── Step 1: Preview feed ───────────────────────────────────────
  async function handlePreview(feedUrl?: string) {
    const targetUrl = feedUrl || url;
    if (!targetUrl.trim()) return;

    setError("");
    setLoading(true);
    setPreview(null);

    let normalizedUrl = targetUrl.trim();
    if (
      !normalizedUrl.startsWith("http://") &&
      !normalizedUrl.startsWith("https://")
    ) {
      normalizedUrl = "https://" + normalizedUrl;
      setUrl(normalizedUrl);
    }

    try {
      const res = await fetch("/api/feeds/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to parse feed");
        return;
      }

      setPreview(data.data);
      setStep(2);
    } catch {
      setError("Could not connect. Check the URL and try again.");
    } finally {
      setLoading(false);
    }
  }

  // ─── OPML: Parse file ──────────────────────────────────────────
  async function handleOpmlFile(file: File) {
    setOpmlParsing(true);
    setError("");
    setOpmlFeeds([]);
    setOpmlLog([]);
    setOpmlStats({ success: 0, skipped: 0, failed: 0 });
    setOpmlDone(false);
    setOpmlActive(new Map());

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/opml/parse", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to parse OPML");
        return;
      }

      setOpmlFeeds(data.data.feeds);
      setOpmlMode(true);
    } catch {
      setError("Failed to read OPML file");
    } finally {
      setOpmlParsing(false);
    }
  }

  // ─── OPML: Fetch from URL ──────────────────────────────────────
  async function handleOpmlUrl() {
    if (!opmlUrl.trim()) return;
    setOpmlParsing(true);
    setError("");
    setOpmlFeeds([]);
    setOpmlLog([]);
    setOpmlStats({ success: 0, skipped: 0, failed: 0 });
    setOpmlDone(false);
    setOpmlActive(new Map());

    try {
      const res = await fetch("/api/opml/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: opmlUrl.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to fetch OPML from URL");
        return;
      }

      setOpmlFeeds(data.data.feeds);
      setOpmlMode(true);
    } catch {
      setError("Failed to fetch OPML from URL");
    } finally {
      setOpmlParsing(false);
    }
  }

  // ─── OPML: Import via SSE stream ────────────────────────────────
  const abortControllerRef = useRef<AbortController | null>(null);

  async function handleOpmlImport() {
    setOpmlImporting(true);
    setOpmlDone(false);
    setOpmlLog([]);
    setOpmlStats({ success: 0, skipped: 0, failed: 0 });
    abortRef.current = false;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/opml/import-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeds: opmlFeeds.map((f) => ({
            url: f.url,
            title: f.title,
            siteUrl: f.siteUrl,
            category: f.category,
          })),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        toast.error("Failed to start import");
        setOpmlImporting(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleStreamEvent(event);
          } catch {
            // malformed line, skip
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("Import stopped");
      } else {
        toast.error("Import connection lost");
      }
    } finally {
      abortControllerRef.current = null;
      setOpmlActive(new Map());
      setOpmlImporting(false);
      setOpmlDone(true);
    }
  }

  function handleStreamEvent(event: Record<string, unknown>) {
    const type = event.type as string;
    const index = event.index as number;

    if (type === "processing") {
      setOpmlActive((prev) => new Map(prev).set(index, event.title as string));
    } else if (type === "success") {
      setOpmlActive((prev) => { const m = new Map(prev); m.delete(index); return m; });
      setOpmlStats((s) => ({ ...s, success: s.success + 1 }));
      setOpmlLog((prev) => [
        ...prev,
        {
          title: event.title as string,
          status: "success",
          message: `${event.articleCount} articles`,
        },
      ]);
    } else if (type === "skipped") {
      setOpmlActive((prev) => { const m = new Map(prev); m.delete(index); return m; });
      setOpmlStats((s) => ({ ...s, skipped: s.skipped + 1 }));
      setOpmlLog((prev) => [
        ...prev,
        {
          title: event.title as string,
          status: "skipped",
          message: event.reason as string,
        },
      ]);
    } else if (type === "failed") {
      setOpmlActive((prev) => { const m = new Map(prev); m.delete(index); return m; });
      setOpmlStats((s) => ({ ...s, failed: s.failed + 1 }));
      setOpmlLog((prev) => [
        ...prev,
        {
          title: event.title as string,
          status: "failed",
          message: event.reason as string,
        },
      ]);
    }
  }

  function handleStopImport() {
    abortControllerRef.current?.abort();
    abortRef.current = true;
  }

  const opmlProcessed = opmlStats.success + opmlStats.skipped + opmlStats.failed;
  const opmlProgress =
    opmlFeeds.length > 0 ? Math.round((opmlProcessed / opmlFeeds.length) * 100) : 0;

  // ─── Step 3: Create category inline ─────────────────────────────
  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);

    try {
      const slug = newCategoryName
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "");

      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCategoryName,
          slug,
          icon: "📁",
          color: "#3b82f6",
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setCategories((prev) => [...prev, data.data]);
        setSelectedCategories((prev) => [...prev, data.data.id]);
        setNewCategoryName("");
        toast.success(`Category "${newCategoryName}" created`);
      } else {
        toast.error(data.error || "Failed to create category");
      }
    } catch {
      toast.error("Failed to create category");
    } finally {
      setCreatingCategory(false);
    }
  }

  // ─── Final: Add feed ────────────────────────────────────────────
  async function handleAddFeed() {
    setAdding(true);

    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          categoryIds:
            selectedCategories.length > 0 ? selectedCategories : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to add feed");
        return;
      }

      toast.success(
        `"${data.data.title}" added with ${data.data._count.articles} articles`
      );
      router.push("/feeds");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setAdding(false);
    }
  }

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [opmlLog]);

  // ─── OPML Import View ──────────────────────────────────────────
  if (opmlMode) {
    return (
      <>
        <Header
          title="Import from OPML"
          subtitle={`${opmlFeeds.length} feeds found`}
          actions={
            !opmlImporting ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  abortRef.current = true;
                  setOpmlMode(false);
                  setOpmlFeeds([]);
                  setOpmlLog([]);
                }}
              >
                <ArrowLeft size={14} />
                Back
              </Button>
            ) : undefined
          }
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 py-6 space-y-5">
            {/* Progress card */}
            <Card className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <CardContent className="p-0 space-y-3">
              {/* Progress bar */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {opmlImporting
                      ? `Importing... ${opmlProcessed}/${opmlFeeds.length}`
                      : opmlDone
                      ? "Import complete"
                      : `${opmlFeeds.length} feeds ready to import`}
                  </span>
                  <span className="text-sm font-mono text-muted-foreground">
                    {opmlProgress}%
                  </span>
                </div>
                <Progress
                  value={opmlProgress}
                  className={cn(
                    "w-full [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:transition-all [&_[data-slot=progress-indicator]]:duration-300",
                    opmlDone && "[&_[data-slot=progress-indicator]]:bg-green-500"
                  )}
                />
              </div>

              {/* Currently importing */}
              {opmlActive.size > 0 && (
                <div className="mt-3 space-y-1.5">
                  {Array.from(opmlActive.entries()).map(([idx, title]) => (
                    <div key={idx} className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-1.5">
                      <Loader2 size={14} className="animate-spin text-primary flex-shrink-0" />
                      <span className="text-sm text-foreground truncate">
                        {title}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground font-mono flex-shrink-0">
                        {idx + 1}/{opmlFeeds.length}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Stats row */}
              {opmlProcessed > 0 && (
                <div className="mt-3 flex items-center gap-4 text-xs font-medium">
                  <span className="flex items-center gap-1 text-green-500">
                    <CheckCircle2 size={12} />
                    {opmlStats.success} added
                  </span>
                  <span className="flex items-center gap-1 text-yellow-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                    {opmlStats.skipped} skipped
                  </span>
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircle size={12} />
                    {opmlStats.failed} failed
                  </span>
                </div>
              )}

              {/* Action button */}
              <div className="mt-4">
                {!opmlImporting && !opmlDone && (
                  <Button
                    onClick={handleOpmlImport}
                    className="w-full"
                    size="lg"
                  >
                    <Upload size={16} />
                    Start Import
                  </Button>
                )}
                {opmlImporting && (
                  <Button
                    variant="destructive"
                    onClick={handleStopImport}
                    className="w-full"
                    size="lg"
                  >
                    <XCircle size={16} />
                    Stop Import
                  </Button>
                )}
                {opmlDone && (
                  <Button
                    onClick={() => router.push("/feeds")}
                    className="w-full"
                    size="lg"
                  >
                    <CheckCircle2 size={16} />
                    Go to Feeds
                  </Button>
                )}
              </div>
              </CardContent>
            </Card>

            {/* Compact log */}
            {opmlLog.length > 0 && (
              <div className="rounded-2xl border border-border bg-card shadow-sm">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Log</h3>
                </div>
                <div className="max-h-64 overflow-y-auto px-4 py-2 font-mono text-xs space-y-0.5">
                  {opmlLog.map((entry, i) => (
                    <div key={i} className="flex items-start gap-2 py-0.5">
                      <span
                        className={cn(
                          "flex-shrink-0 mt-0.5",
                          entry.status === "success"
                            ? "text-green-500"
                            : entry.status === "skipped"
                            ? "text-yellow-500"
                            : "text-destructive"
                        )}
                      >
                        {entry.status === "success"
                          ? "+"
                          : entry.status === "skipped"
                          ? "~"
                          : "x"}
                      </span>
                      <span className="text-foreground truncate">
                        {entry.title}
                      </span>
                      {entry.message && (
                        <span className="ml-auto flex-shrink-0 text-muted-foreground">
                          {entry.message}
                        </span>
                      )}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ─── Normal add feed view ───────────────────────────────────────
  return (
    <>
      <Header
        title="Add Feed"
        subtitle="Subscribe to a new RSS feed"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/feeds")}
          >
            <ArrowLeft size={14} />
            Back
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {/* Step indicator */}
          <div className="mb-8">
            <StepIndicator currentStep={step} />
          </div>

          {/* ─── STEP 1: URL Input ─────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-6">
              {/* URL input card */}
              <Card className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <CardContent className="p-0">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Rss size={20} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Feed URL</h2>
                    <p className="text-sm text-muted-foreground">
                      Paste an RSS, Atom, or JSON Feed URL
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handlePreview()}
                      placeholder="https://example.com/feed.xml"
                      autoFocus
                      className="w-full rounded-xl py-3 pl-10 pr-4 text-sm"
                    />
                  </div>
                  <Button
                    onClick={() => handlePreview()}
                    disabled={loading || !url.trim()}
                    size="lg"
                  >
                    {loading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Search size={16} />
                    )}
                    Preview
                  </Button>
                </div>

                {error && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}
                </CardContent>
              </Card>

              {/* OPML import */}
              <Card className="rounded-2xl border border-dashed border-border bg-card/50 p-5">
                <CardContent className="p-0 space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".opml,.xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleOpmlFile(file);
                    e.target.value = "";
                  }}
                />
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <FileText size={16} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Import from OPML</p>
                    <p className="text-xs text-muted-foreground">
                      Bulk import feeds from file or URL
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={opmlParsing}
                    >
                      {opmlParsing && !opmlUrlMode ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Parsing...
                        </>
                      ) : (
                        <>
                          <Upload size={14} />
                          File
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOpmlUrlMode(!opmlUrlMode)}
                      className={cn(
                        opmlUrlMode && "border-primary bg-primary/10 text-primary"
                      )}
                    >
                      <Globe size={14} />
                      URL
                    </Button>
                  </div>
                </div>

                {opmlUrlMode && (
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      value={opmlUrl}
                      onChange={(e) => setOpmlUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleOpmlUrl()}
                      placeholder="https://example.com/subscriptions.opml"
                      className="flex-1"
                    />
                    <Button
                      onClick={handleOpmlUrl}
                      disabled={opmlParsing || !opmlUrl.trim()}
                    >
                      {opmlParsing && opmlUrlMode ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      Import
                    </Button>
                  </div>
                )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ─── STEP 2: Preview ───────────────────────────────── */}
          {step === 2 && preview && (
            <div className="space-y-6">
              <Card className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <CardContent className="p-0">
                <div className="flex items-start gap-4">
                  {preview.imageUrl ? (
                    <img
                      src={preview.imageUrl}
                      alt=""
                      className="h-14 w-14 flex-shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <Rss size={24} className="text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold text-foreground">
                      {preview.title}
                    </h2>
                    {preview.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {preview.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                        <FileText size={12} />
                        {preview.itemCount} articles
                      </Badge>
                      {preview.siteUrl && (
                        <a
                          href={preview.siteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-primary transition-colors"
                        >
                          <ExternalLink size={12} />
                          {new URL(preview.siteUrl).hostname}
                        </a>
                      )}
                      {preview.language && (
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          <Globe size={12} />
                          {preview.language.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                </CardContent>
              </Card>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Latest Articles
                </h3>
                <div className="space-y-2">
                  {preview.items.map((item, i) => (
                    <PreviewArticle
                      key={i}
                      title={item.title}
                      author={item.author}
                      publishedAt={item.publishedAt}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    setPreview(null);
                  }}
                >
                  <ArrowLeft size={14} />
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setStep(3)}
                >
                  Continue
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* ─── STEP 3: Categorize & Add ──────────────────────── */}
          {step === 3 && preview && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Rss size={18} className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">
                    {preview.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {preview.itemCount} articles · {url}
                  </p>
                </div>
                <CheckCircle2 size={20} className="text-accent" />
              </div>

              <Card className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <CardContent className="p-0">
                <div className="flex items-center gap-2 mb-4">
                  <FolderTree size={16} className="text-primary" />
                  <h3 className="text-base font-semibold">
                    Assign Categories
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    (optional)
                  </span>
                </div>

                {/* AI suggestions */}
                {aiSuggestions.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Sparkles size={12} className="text-primary" />
                      AI suggested
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {aiSuggestions.map((name) => {
                        const match = categories.find(
                          (c) => c.name.toLowerCase() === name.toLowerCase()
                        );
                        const isSelected = match && selectedCategories.includes(match.id);
                        return (
                          <Button
                            key={name}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (match) toggleCategory(match.id);
                            }}
                            disabled={!match}
                            className={cn(
                              "flex items-center gap-1.5",
                              match
                                ? isSelected
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-primary/50 bg-primary/5 text-foreground hover:border-primary"
                                : "border-border text-muted-foreground cursor-not-allowed"
                            )}
                          >
                            <Sparkles size={12} className="text-primary" />
                            {name}
                            {isSelected && <CheckCircle2 size={14} />}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {loadingSuggestions && (
                  <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    Getting AI suggestions...
                  </div>
                )}

                {categories.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {categories.map((cat) => {
                      const isSelected = selectedCategories.includes(cat.id);
                      return (
                        <Button
                          key={cat.id}
                          variant="outline"
                          size="sm"
                          onClick={() => toggleCategory(cat.id)}
                          className={cn(
                            "flex items-center gap-2",
                            isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-foreground hover:border-primary/40"
                          )}
                        >
                          <span>{cat.icon || "📁"}</span>
                          {cat.name}
                          {isSelected && <CheckCircle2 size={14} />}
                        </Button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Plus
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleCreateCategory()
                      }
                      placeholder="New category name..."
                      className="w-full rounded-lg border-dashed py-2 pl-9 pr-3 text-sm"
                    />
                  </div>
                  {newCategoryName.trim() && (
                    <Button
                      variant="secondary"
                      onClick={handleCreateCategory}
                      disabled={creatingCategory}
                    >
                      {creatingCategory ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        "Create"
                      )}
                    </Button>
                  )}
                </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                >
                  <ArrowLeft size={14} />
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleAddFeed}
                  disabled={adding}
                >
                  {adding ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Plus size={16} />
                      Add Feed
                      {selectedCategories.length > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {selectedCategories.length} categories
                        </Badge>
                      )}
                    </>
                  )}
                </Button>
              </div>

              <div className="text-center">
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setSelectedCategories([]);
                    handleAddFeed();
                  }}
                  disabled={adding}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Skip categories and add directly →
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
