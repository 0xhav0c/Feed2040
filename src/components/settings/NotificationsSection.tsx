"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Bell, BellOff, Check, CheckCheck, ExternalLink, Loader2, Plus, RefreshCw, Send, Star, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isPushSupported, getPushState, enablePush, disablePush, type PushState } from "@/lib/push-client";
import { cn } from "@/lib/utils";
import { CardSkeleton, CopyField, Note, SettingRow, SettingsCard, StatusBadge, ToggleChip } from "./primitives";
import { SecretKeyField, type KeyInfo } from "./SecretKeyField";

export function NotificationsSection({ onNavigate }: { onNavigate: (section: string) => void }) {
  return (
    <div className="space-y-6">
      <AlertRulesCard />
      <BrowserPushCard />
      <TelegramCard onNavigate={onNavigate} />
    </div>
  );
}

/* ─── Browser push ─── */

function BrowserPushCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setState("unsupported");
      return;
    }
    getPushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      if (!on) {
        await disablePush();
        setState("unsubscribed");
        toast.success("Notifications turned off on this device");
      } else {
        const r = await enablePush();
        if (r.ok) {
          setState("subscribed");
          toast.success("Notifications turned on for this device");
        } else {
          toast.error(r.error || "Couldn't turn on notifications");
          setState(await getPushState());
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      if (r.ok) toast.success("Test notification sent");
      else toast.error("Couldn't send a test notification");
    } catch {
      toast.error("Couldn't send a test notification");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard
      title="Browser notifications"
      description="Alert-rule matches as desktop or phone notifications. Set up separately on each device."
      action={
        state === "subscribed" ? (
          <StatusBadge tone="success">On for this device</StatusBadge>
        ) : state === "denied" ? (
          <StatusBadge tone="warning">Blocked</StatusBadge>
        ) : null
      }
    >
      {state === null ? (
        <div className="py-4">
          <div className="h-9 animate-pulse rounded-lg bg-muted/60" />
        </div>
      ) : state === "unsupported" ? (
        <div className="py-4">
          <Note>
            <span className="flex items-center gap-2">
              <BellOff size={14} aria-hidden /> This browser doesn&apos;t support push notifications. On iPhone, add Feed2040
              to the Home Screen first.
            </span>
          </Note>
        </div>
      ) : state === "denied" ? (
        <div className="py-4">
          <Note tone="warning">
            Notifications are blocked for this site. Allow them in the browser&apos;s site settings, then reload the page.
          </Note>
        </div>
      ) : (
        <SettingRow label="Notify me on this device" htmlFor="push-toggle">
          <div className="flex flex-wrap items-center gap-3">
            <Switch id="push-toggle" checked={state === "subscribed"} onCheckedChange={(v: boolean) => toggle(v)} disabled={busy} />
            {state === "subscribed" && (
              <Button variant="outline" size="sm" onClick={sendTest} disabled={busy}>
                <Bell aria-hidden /> Send a test
              </Button>
            )}
          </div>
        </SettingRow>
      )}
    </SettingsCard>
  );
}

/* ─── Telegram ─── */

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 py-4">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
          done ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
        )}
        aria-hidden
      >
        {done ? <Check size={14} /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2.5">
        <p className="text-sm font-medium">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </p>
        {children}
      </div>
    </li>
  );
}

function TelegramCard({ onNavigate }: { onNavigate: (s: string) => void }) {
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [keysRes, settingsRes, botRes] = await Promise.all([
        fetch("/api/settings/keys"),
        fetch("/api/settings/telegram"),
        fetch("/api/settings/telegram/bot-info"),
      ]);
      const keys = await keysRes.json();
      const settings = await settingsRes.json();
      const bot = await botRes.json();
      setKeyInfo(keys.data?.telegram ?? null);
      // A row survives /stop with isActive=false; that must offer a new link.
      setConnected(!!(settingsRes.ok && settings.data?.isActive));
      setBotUsername(bot.data?.botUsername ?? null);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/settings/telegram/connect-token", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.data?.token) setToken(d.data.token);
      else toast.error(d.error || "Couldn't create a link");
    } catch {
      toast.error("Couldn't create a link");
    } finally {
      setGenerating(false);
    }
  }

  async function checkAgain() {
    setChecking(true);
    await load();
    setChecking(false);
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/telegram/test", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) toast.success("Test message sent — check Telegram");
      else toast.error(d.error || "Couldn't send the test message");
    } catch {
      toast.error("Couldn't send the test message");
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <CardSkeleton rows={3} />;

  const hasBot = !!keyInfo?.configured;

  return (
    <SettingsCard
      title="Telegram"
      description="Receive alerts and daily briefings in Telegram through your own bot."
      action={
        <StatusBadge tone={connected ? "success" : "neutral"}>{connected ? "Connected" : "Not connected"}</StatusBadge>
      }
    >
      <ol>
        <Step n={1} done={hasBot} title="Add your bot token">
          <p className="text-[13px] text-muted-foreground">
            In Telegram, message @BotFather, send <code className="font-mono">/newbot</code> and paste the token it gives you.
          </p>
          <div className="max-w-xl">
            <SecretKeyField
              name="Bot token"
              settingKey="telegram_bot_token"
              keyInfo={keyInfo}
              placeholder="123456:ABC-DEF…"
              onSaved={load}
              helpUrl="https://t.me/BotFather"
              helpLabel="Open @BotFather"
            />
          </div>
        </Step>

        <Step n={2} done={connected} title="Link your Telegram account">
          {!hasBot ? (
            <p className="text-[13px] text-muted-foreground">Available after step 1.</p>
          ) : connected ? (
            <p className="text-[13px] text-muted-foreground">
              Linked{botUsername ? <> to @{botUsername}</> : null}. Send <code className="font-mono">/stop</code> to the bot to unlink.
            </p>
          ) : (
            <div className="max-w-xl space-y-2.5">
              {!token ? (
                <Button onClick={generate} disabled={generating}>
                  {generating && <Loader2 className="animate-spin" aria-hidden />}
                  Create link code
                </Button>
              ) : (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    Send this message to {botUsername ? <strong className="text-foreground">@{botUsername}</strong> : "your bot"}:
                  </p>
                  <CopyField value={`/start ${token}`} label="Link command" />
                  <div className="flex flex-wrap gap-2">
                    {botUsername && (
                      <a
                        href={`https://t.me/${botUsername}?start=${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: "outline" })}
                      >
                        Open in Telegram <ExternalLink aria-hidden />
                      </a>
                    )}
                    <Button variant="ghost" onClick={checkAgain} disabled={checking}>
                      {checking ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                      I&apos;ve sent it
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Step>

        <Step n={3} done={false} title="Try it">
          {connected ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={sendTest} disabled={testing}>
                {testing ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                Send a test message
              </Button>
              <Button variant="ghost" onClick={() => onNavigate("briefing")}>
                Choose briefing delivery times
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Available after linking your account.</p>
          )}
        </Step>
      </ol>
    </SettingsCard>
  );
}

/* ─── Alert rules ─── */

type RuleAction = "markRead" | "star" | "tag";
type Rule = {
  id: string;
  name: string;
  keywords: string[];
  isActive: boolean;
  notifyTelegram: boolean;
  actions?: RuleAction[];
  tagName?: string | null;
};

const ACTIONS: { key: RuleAction; label: string; icon: typeof Star }[] = [
  { key: "markRead", label: "Mark as read", icon: CheckCheck },
  { key: "star", label: "Bookmark", icon: Star },
  { key: "tag", label: "Add a tag", icon: Tag },
];

function AlertRulesCard() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notification-rules");
      const d = await res.json();
      setRules(res.ok ? d.data || [] : []);
    } catch {
      setRules([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(rule: Rule) {
    setRules((prev) => prev?.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r)) ?? null);
    try {
      const res = await fetch(`/api/notification-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (!res.ok) throw new Error();
      toast.success(`“${rule.name}” ${rule.isActive ? "paused" : "turned on"}`);
    } catch {
      setRules((prev) => prev?.map((r) => (r.id === rule.id ? { ...r, isActive: rule.isActive } : r)) ?? null);
      toast.error("Couldn't update the rule");
    }
  }

  async function remove() {
    const rule = deleteTarget;
    if (!rule) return;
    setDeleteTarget(null);
    setRules((prev) => prev?.filter((r) => r.id !== rule.id) ?? null);
    try {
      const res = await fetch(`/api/notification-rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`Deleted “${rule.name}”`);
    } catch {
      load();
      toast.error("Couldn't delete the rule");
    }
  }

  return (
    <SettingsCard
      title="Alert rules"
      description="When a new article mentions one of your keywords, get notified and optionally act on it automatically."
      action={
        !adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden /> New rule
          </Button>
        )
      }
    >
      {adding && (
        <div className="py-4">
          <NewRuleForm
            onCancel={() => setAdding(false)}
            onCreated={() => {
              setAdding(false);
              load();
            }}
          />
        </div>
      )}
      {rules === null ? (
        <div className="space-y-2 py-4">
          <div className="h-14 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-14 animate-pulse rounded-lg bg-muted/60" />
        </div>
      ) : rules.length === 0 ? (
        !adding && (
          <div className="py-8 text-center">
            <p className="text-sm font-medium">No alert rules yet</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              For example: notify me about “CVE, zero-day” and bookmark those articles.
            </p>
          </div>
        )
      ) : (
        <ul className="divide-y divide-border">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
              <Switch
                checked={rule.isActive}
                onCheckedChange={() => toggle(rule)}
                aria-label={`${rule.isActive ? "Pause" : "Turn on"} ${rule.name}`}
              />
              <div className={cn("min-w-0 flex-1", !rule.isActive && "opacity-60")}>
                <p className="text-sm font-medium">
                  {rule.name}
                  {!rule.isActive && <span className="ml-2 text-xs font-normal text-muted-foreground">Paused</span>}
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Matches{" "}
                  {rule.keywords.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ", "}
                      <span className="text-foreground">{k}</span>
                    </span>
                  ))}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {rule.notifyTelegram && <StatusBadge tone="info">Telegram</StatusBadge>}
                  {rule.actions?.map((a) => {
                    const meta = ACTIONS.find((x) => x.key === a);
                    if (!meta) return null;
                    return (
                      <StatusBadge key={a} tone="neutral">
                        {a === "tag" && rule.tagName ? `Tag “${rule.tagName}”` : meta.label}
                      </StatusBadge>
                    );
                  })}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(rule)}
                aria-label={`Delete ${rule.name}`}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 aria-hidden /> Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this rule?"
        description={`“${deleteTarget?.name}” will stop matching new articles. Articles it already acted on stay as they are.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </SettingsCard>
  );
}

function NewRuleForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const uid = useId();
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [telegram, setTelegram] = useState(true);
  const [actions, setActions] = useState<RuleAction[]>([]);
  const [tagName, setTagName] = useState("");
  const [saving, setSaving] = useState(false);

  const kw = keywords.split(",").map((k) => k.trim()).filter(Boolean);
  const needsTag = actions.includes("tag") && !tagName.trim();
  const ready = name.trim() && kw.length > 0 && !needsTag;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const res = await fetch("/api/notification-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          keywords: kw,
          notifyTelegram: telegram,
          actions,
          tagName: actions.includes("tag") ? tagName.trim() : undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Rule “${name.trim()}” created`);
        onCreated();
      } else {
        toast.error(d.error || "Couldn't create the rule");
      }
    } catch {
      toast.error("Couldn't create the rule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-name`} className="text-sm font-medium">
            Name
          </label>
          <Input
            id={`${uid}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Critical CVEs"
            maxLength={100}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-kw`} className="text-sm font-medium">
            Keywords
          </label>
          <Input
            id={`${uid}-kw`}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="CVE, ransomware, zero-day"
            aria-describedby={`${uid}-kw-help`}
          />
          <p id={`${uid}-kw-help`} className="text-[13px] text-muted-foreground">
            Separate with commas. Matched against article titles and summaries, ignoring case.
          </p>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Also do this automatically</legend>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map(({ key, label, icon: Icon }) => (
            <ToggleChip
              key={key}
              pressed={actions.includes(key)}
              onClick={() => setActions((prev) => (prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]))}
            >
              <Icon size={13} aria-hidden /> {label}
            </ToggleChip>
          ))}
        </div>
        {actions.includes("tag") && (
          <div className="max-w-xs pt-1">
            <label htmlFor={`${uid}-tag`} className="sr-only">
              Tag name
            </label>
            <Input
              id={`${uid}-tag`}
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="Tag name, e.g. Security"
              maxLength={50}
              aria-invalid={needsTag}
            />
          </div>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Switch checked={telegram} onCheckedChange={(v: boolean) => setTelegram(v)} />
          Send a Telegram message too
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready || saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Create rule
          </Button>
        </div>
      </div>
    </form>
  );
}
