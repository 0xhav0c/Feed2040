"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* Shared building blocks for the settings sections: every section is a stack
   of SettingsCards, each made of SettingRows (label + help on the left,
   control on the right on wide screens, stacked on narrow ones). */

export function SettingsCard({
  title,
  description,
  action,
  footer,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-1">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children && <div className="divide-y divide-border px-5">{children}</div>}
      {footer}
    </section>
  );
}

export function SettingRow({
  label,
  description,
  htmlFor,
  children,
  stacked,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** id of the control, so clicking the label focuses it */
  htmlFor?: string;
  children: ReactNode;
  /** keep label above the control even on wide screens (lists, chip groups) */
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-8 gap-y-2 py-4",
        !stacked && "lg:grid-cols-[minmax(200px,2fr)_minmax(0,3fr)] lg:items-center"
      )}
    >
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium text-foreground">{label}</p>
        )}
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Card footer for forms that save explicitly: shows unsaved state, Discard and Save. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  label = "Save changes",
  disabled,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3 rounded-b-xl">
      <p aria-live="polite" className="mr-auto flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {dirty && (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />
            Unsaved changes
          </>
        )}
      </p>
      {dirty && onDiscard && (
        <Button variant="ghost" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
      )}
      <Button onClick={onSave} disabled={!dirty || saving || disabled}>
        {saving && <Loader2 className="animate-spin" aria-hidden />}
        {saving ? "Saving…" : label}
      </Button>
    </div>
  );
}

const selectBase =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-popover [&>option]:text-popover-foreground";

export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select className={cn(selectBase, className)} {...props}>
      {children}
    </select>
  );
}

export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide" : "Show"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {show ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
      </button>
    </div>
  );
}

/** Read-only value with a copy button (endpoints, usernames, keys). */
export function CopyField({
  value,
  display,
  label,
  mono = true,
}: {
  value: string;
  display?: string;
  label: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select and copy it manually");
    }
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        value={display ?? value}
        aria-label={label}
        className={cn("bg-muted/40", mono && "font-mono text-[13px]")}
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label}`} className="size-9 shrink-0">
        {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
      </Button>
    </div>
  );
}

type Tone = "success" | "warning" | "danger" | "info" | "neutral";
const toneClass: Record<Tone, string> = {
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-signal/10 text-signal",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", toneClass[tone], className)}>
      {children}
    </span>
  );
}

/** Callout box for notes and warnings inside a card. */
export function Note({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cn("rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed", toneClass[tone])}>{children}</div>;
}

/** Editable list of HH:MM times shown as removable chips. */
export function TimeListEditor({
  value,
  onChange,
  emptyText = "No times yet",
  idPrefix,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  emptyText?: string;
  idPrefix?: string;
}) {
  const auto = useId();
  const inputId = `${idPrefix ?? auto}-new-time`;
  const [draft, setDraft] = useState("09:00");
  const sorted = [...value].sort();

  function add() {
    if (!/^\d{2}:\d{2}$/.test(draft)) return;
    if (value.includes(draft)) {
      toast.message(`${draft} is already in the list`);
      return;
    }
    onChange([...value, draft].sort());
  }

  return (
    <div className="space-y-2.5">
      <ul className="flex flex-wrap gap-2" aria-label="Scheduled times">
        {sorted.length === 0 && <li className="text-[13px] text-muted-foreground">{emptyText}</li>}
        {sorted.map((t) => (
          <li key={t} className="flex h-8 items-center gap-1 rounded-lg border border-border bg-muted/40 pl-3 pr-1 text-sm tabular-nums">
            {t}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== t))}
              aria-label={`Remove ${t}`}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <X size={13} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          New time
        </label>
        <Input
          id={inputId}
          type="time"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="w-32 tabular-nums"
        />
        <Button type="button" variant="outline" onClick={add}>
          <Plus aria-hidden /> Add time
        </Button>
      </div>
    </div>
  );
}

/** Chip-style multi toggle (categories, actions). */
export function ToggleChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        pressed
          ? "border-primary/60 bg-primary/10 font-medium text-primary"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
      )}
    >
      {pressed && <Check size={13} aria-hidden />}
      {children}
    </button>
  );
}

/** Loading placeholder that keeps the card's shape. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-3 w-64 animate-pulse rounded bg-muted/70" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/60" />
        ))}
      </div>
    </div>
  );
}

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "ru", label: "Русский" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "pt", label: "Português" },
  { value: "ar", label: "العربية" },
  { value: "it", label: "Italiano" },
] as const;

/** Every IANA zone the browser knows, falling back to a short list. */
export function timeZones(current?: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    /* older browsers */
  }
  if (zones.length === 0) {
    zones = ["UTC", "Europe/Istanbul", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Tokyo"];
  }
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones;
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
