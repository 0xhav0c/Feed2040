"use client";

import { useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingRow, SettingsCard } from "./primitives";

const today = () => new Date().toISOString().slice(0, 10);

async function download(url: string, filename: string, what: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
    toast.success(`${what} downloaded`);
  } catch {
    toast.error(`Couldn't export ${what.toLowerCase()}`);
  }
}

export function DataSection() {
  return (
    <div className="space-y-6">
      <ImportCard />
      <ExportCard />
    </div>
  );
}

function FilePickButton({
  accept,
  label,
  busy,
  disabled,
  onFile,
}: {
  accept: string;
  label: string;
  busy: boolean;
  disabled: boolean;
  onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      <Button variant="outline" onClick={() => ref.current?.click()} disabled={disabled}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
        {busy ? "Importing…" : label}
      </Button>
    </>
  );
}

function ImportCard() {
  const [busy, setBusy] = useState<"opml" | "json" | null>(null);

  async function importOpml(file: File) {
    setBusy("opml");
    try {
      const res = await fetch("/api/opml", {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: await file.text(),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        const { imported = 0, skipped = 0, failed = 0 } = d.data || {};
        toast.success(
          `${imported} feed${imported === 1 ? "" : "s"} added` +
            (skipped ? `, ${skipped} already subscribed` : "") +
            (failed ? `, ${failed} couldn't be added` : "")
        );
      } else {
        toast.error(d.error || "Import failed — is this an OPML file?");
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setBusy(null);
    }
  }

  async function importJson(file: File) {
    setBusy("json");
    try {
      const res = await fetch("/api/import/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await file.text(),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        const { feedsImported = 0, categoriesImported = 0, skipped = 0 } = d.data || {};
        toast.success(
          `${feedsImported} feeds and ${categoriesImported} categories added` + (skipped ? `, ${skipped} skipped` : "")
        );
      } else {
        toast.error(d.error || "Import failed — is this a Feed2040 backup?");
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsCard title="Import" description="Feeds you're already subscribed to are skipped, so importing twice is safe.">
      <SettingRow label="From another RSS reader" description="An OPML file (.opml or .xml) exported from Feedly, Inoreader, NetNewsWire, etc.">
        <FilePickButton accept=".opml,.xml" label="Choose OPML file" busy={busy === "opml"} disabled={busy !== null} onFile={importOpml} />
      </SettingRow>
      <SettingRow label="From a Feed2040 backup" description="Restores feeds and categories from a JSON backup. Articles and bookmarks aren't restored.">
        <FilePickButton accept=".json,application/json" label="Choose JSON file" busy={busy === "json"} disabled={busy !== null} onFile={importJson} />
      </SettingRow>
    </SettingsCard>
  );
}

function ExportCard() {
  const [busy, setBusy] = useState<"opml" | "json" | "md" | null>(null);

  async function run(kind: "opml" | "json" | "md") {
    setBusy(kind);
    if (kind === "opml") await download("/api/opml", `feed2040-feeds-${today()}.opml`, "Feed list");
    if (kind === "json") await download("/api/export/json?bookmarks=true", `feed2040-backup-${today()}.json`, "Backup");
    if (kind === "md") await download("/api/export/highlights", `feed2040-highlights-${today()}.md`, "Highlights");
    setBusy(null);
  }

  const btn = (kind: "opml" | "json" | "md", label: string) => (
    <Button variant="outline" onClick={() => run(kind)} disabled={busy !== null}>
      {busy === kind ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      {label}
    </Button>
  );

  return (
    <SettingsCard title="Export" description="Download your data. Files are generated on the fly.">
      <SettingRow label="Feed list" description="OPML — opens in any RSS reader.">
        {btn("opml", "Download OPML")}
      </SettingRow>
      <SettingRow label="Full backup" description="JSON with your feeds, categories and bookmarks. Articles themselves aren't included.">
        {btn("json", "Download JSON")}
      </SettingRow>
      <SettingRow label="Highlights" description="Markdown grouped by article — works well with Obsidian.">
        {btn("md", "Download Markdown")}
      </SettingRow>
    </SettingsCard>
  );
}
