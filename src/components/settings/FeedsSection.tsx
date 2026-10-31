"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CardSkeleton, Note, SaveBar, Select, SettingRow, SettingsCard, StatusBadge } from "./primitives";

const INTERVAL_OPTIONS = [
  { value: 5, label: "Every 5 minutes" },
  { value: 10, label: "Every 10 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Once a day" },
];

const RETENTION_OPTIONS = [
  { value: 0, label: "Forever" },
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 365, label: "1 year" },
];

export function FeedsSection({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="space-y-6">
      <RefreshCard isAdmin={isAdmin} />
      <FeedHealthCard />
    </div>
  );
}

type RefreshSettings = { intervalMinutes: number; importConcurrency: number; retentionDays: number };

function RefreshCard({ isAdmin }: { isAdmin: boolean }) {
  const [saved, setSaved] = useState<RefreshSettings | null>(null);
  const [draft, setDraft] = useState<RefreshSettings>({ intervalMinutes: 15, importConcurrency: 5, retentionDays: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/refresh")
      .then((r) => r.json())
      .then((d) => {
        const s: RefreshSettings = {
          intervalMinutes: d.data?.intervalMinutes ?? 15,
          importConcurrency: d.data?.importConcurrency ?? 5,
          retentionDays: d.data?.retentionDays ?? 0,
        };
        setSaved(s);
        setDraft(s);
      })
      .catch(() => setSaved({ intervalMinutes: 15, importConcurrency: 5, retentionDays: 0 }));
  }, []);

  if (!saved) return <CardSkeleton rows={3} />;

  const dirty =
    draft.intervalMinutes !== saved.intervalMinutes ||
    draft.importConcurrency !== saved.importConcurrency ||
    draft.retentionDays !== saved.retentionDays;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/refresh", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaved(draft);
        toast.success("Feed settings saved");
      } else {
        toast.error(d.error || "Couldn't save feed settings");
      }
    } catch {
      toast.error("Couldn't save feed settings");
    } finally {
      setSaving(false);
    }
  }

  const intervalOptions = INTERVAL_OPTIONS.some((o) => o.value === draft.intervalMinutes)
    ? INTERVAL_OPTIONS
    : [...INTERVAL_OPTIONS, { value: draft.intervalMinutes, label: `Every ${draft.intervalMinutes} minutes` }];

  return (
    <SettingsCard
      title="Refreshing"
      description="Applies to everyone on this server."
      footer={isAdmin ? <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setDraft(saved)} /> : undefined}
    >
      {!isAdmin && (
        <div className="py-4">
          <Note>Only an admin can change these settings.</Note>
        </div>
      )}
      <SettingRow label="Check for new articles" description="How often every feed is fetched." htmlFor="feed-interval">
        <Select
          id="feed-interval"
          value={draft.intervalMinutes}
          disabled={!isAdmin}
          onChange={(e) => setDraft({ ...draft, intervalMinutes: Number(e.target.value) })}
          className="max-w-sm"
        >
          {intervalOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </SettingRow>
      <SettingRow
        label="Keep articles for"
        description="Older articles are deleted automatically. Bookmarked and highlighted articles are always kept."
        htmlFor="feed-retention"
      >
        <Select
          id="feed-retention"
          value={draft.retentionDays}
          disabled={!isAdmin}
          onChange={(e) => setDraft({ ...draft, retentionDays: Number(e.target.value) })}
          className="max-w-sm"
        >
          {RETENTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </SettingRow>
      <SettingRow
        label="Feeds fetched at once"
        description="Higher is faster; lower is gentler on a small server."
        htmlFor="feed-concurrency"
      >
        <div className="flex max-w-sm items-center gap-3">
          <input
            id="feed-concurrency"
            type="range"
            min={1}
            max={20}
            value={draft.importConcurrency}
            disabled={!isAdmin}
            onChange={(e) => setDraft({ ...draft, importConcurrency: Number(e.target.value) })}
            className="flex-1 accent-primary disabled:opacity-50"
          />
          <output htmlFor="feed-concurrency" className="w-8 text-right text-sm font-medium tabular-nums">
            {draft.importConcurrency}
          </output>
        </div>
      </SettingRow>
    </SettingsCard>
  );
}

type FeedHealthEntry = {
  id: string;
  title: string;
  errorCount: number;
  fetchError: string | null;
  lastFetched: string | null;
};

function FeedHealthCard() {
  const [feeds, setFeeds] = useState<FeedHealthEntry[] | null>(null);
  const [retrying, setRetrying] = useState<string | "all" | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FeedHealthEntry | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/feeds");
      const data = await res.json();
      if (res.ok && Array.isArray(data.data)) {
        setFeeds(
          (data.data as FeedHealthEntry[]).filter((f) => f.errorCount > 0).sort((a, b) => b.errorCount - a.errorCount)
        );
      } else {
        setFeeds([]);
      }
    } catch {
      setFeeds([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function retry(target: FeedHealthEntry | "all") {
    if (!feeds) return;
    setRetrying(target === "all" ? "all" : target.id);
    try {
      const res = await fetch("/api/feeds/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target === "all" ? { feedIds: feeds.map((f) => f.id) } : { feedId: target.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Couldn't retry");
      } else if (target === "all") {
        const { updated = 0, failed = 0 } = data.data || {};
        toast.success(`${updated} recovered, ${failed} still failing`);
      } else {
        toast.success(`Retried “${target.title}”`);
      }
      await load();
    } catch {
      toast.error("Couldn't retry");
    } finally {
      setRetrying(null);
    }
  }

  async function remove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/feeds/${removeTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`Unsubscribed from “${removeTarget.title}”`);
        setFeeds((prev) => prev?.filter((f) => f.id !== removeTarget.id) ?? null);
      } else {
        toast.error("Couldn't remove the feed");
      }
    } catch {
      toast.error("Couldn't remove the feed");
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  }

  return (
    <SettingsCard
      title="Feed health"
      description="Feeds whose last fetches failed. Most recover on their own; retry or unsubscribe if they don't."
      action={
        feeds === null ? null : feeds.length === 0 ? (
          <StatusBadge tone="success">
            <CheckCircle2 size={13} aria-hidden /> All feeds healthy
          </StatusBadge>
        ) : (
          <Button variant="outline" size="sm" onClick={() => retry("all")} disabled={retrying !== null}>
            {retrying === "all" ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            Retry all ({feeds.length})
          </Button>
        )
      }
    >
      {feeds === null ? (
        <div className="space-y-2 py-4">
          <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
        </div>
      ) : feeds.length === 0 ? null : (
        <ul className="divide-y divide-border">
          {feeds.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={f.title}>
                  {f.title}
                </p>
                <p className="truncate text-[13px] text-muted-foreground" title={f.fetchError || undefined}>
                  {f.fetchError || "Unknown error"}
                </p>
              </div>
              <StatusBadge tone="danger">
                Failed {f.errorCount}×
              </StatusBadge>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => retry(f)}
                  disabled={retrying !== null}
                  aria-label={`Retry ${f.title}`}
                >
                  {retrying === f.id ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                  Retry
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoveTarget(f)}
                  aria-label={`Unsubscribe from ${f.title}`}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 aria-hidden />
                  Unsubscribe
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!removeTarget}
        title="Unsubscribe from this feed?"
        description={`“${removeTarget?.title}” and its articles will be removed. Bookmarked articles from it are deleted too.`}
        confirmLabel="Unsubscribe"
        variant="danger"
        loading={removing}
        onConfirm={remove}
        onCancel={() => setRemoveTarget(null)}
      />
    </SettingsCard>
  );
}
