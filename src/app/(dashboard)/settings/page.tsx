"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import {
  User,
  Users,
  Bot,
  Clock,
  Globe,
  Save,
  Sparkles,
  Loader2,
  RefreshCw,
  Upload,
  CheckCircle2,
  Send,
  Eye,
  EyeOff,
  Key,
  Trash2,
  ExternalLink,
  Shield,
  Cpu,
  AlertTriangle,
  Zap,
  Server,
  ArrowRight,
  Wifi,
  Copy,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { UsersAdminTab } from "@/components/settings/UsersAdminTab";

const BASE_TABS = [
  { id: "general", label: "General", icon: User },
  { id: "ai", label: "AI Settings", icon: Sparkles },
  { id: "telegram", label: "Telegram Bot", icon: Bot },
  { id: "notifications", label: "Alerts", icon: Shield },
  { id: "data", label: "Import & Export", icon: ArrowRight },
  { id: "fever", label: "Fever API", icon: Wifi },
];

const ADMIN_TAB = { id: "users", label: "Users", icon: Users };

type TabId = string;

const PROVIDERS = [
  { value: "openai", label: "OpenAI", icon: "🟢", description: "GPT-4o, GPT-4.1 models" },
  { value: "anthropic", label: "Anthropic", icon: "🟣", description: "Claude Sonnet, Opus" },
  { value: "ollama", label: "Ollama", icon: "🦙", description: "Local AI — free, private" },
] as const;

const PROVIDER_MODELS: Record<
  string,
  { value: string; label: string; tier: "fast" | "balanced" | "powerful" }[]
> = {
  openai: [
    { value: "gpt-4.1-nano", label: "GPT-4.1 Nano", tier: "fast" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini", tier: "fast" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini", tier: "balanced" },
    { value: "gpt-4o", label: "GPT-4o", tier: "powerful" },
    { value: "gpt-4.1", label: "GPT-4.1", tier: "powerful" },
  ],
  anthropic: [
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", tier: "fast" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", tier: "balanced" },
    { value: "claude-opus-4-6", label: "Claude Opus 4.6", tier: "powerful" },
  ],
  ollama: [],
};

const TIER_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" | "ghost" | "link"; className?: string }> = {
  fast: { label: "Fast", variant: "secondary", className: "bg-green-500/10 text-green-600 border-transparent" },
  balanced: { label: "Balanced", variant: "secondary", className: "bg-blue-500/10 text-blue-600 border-transparent" },
  powerful: { label: "Powerful", variant: "secondary", className: "bg-purple-500/10 text-purple-600 border-transparent" },
};

const LANGUAGES = [
  { value: "en", label: "🇬🇧 English" },
  { value: "tr", label: "🇹🇷 Türkçe" },
  { value: "de", label: "🇩🇪 Deutsch" },
  { value: "fr", label: "🇫🇷 Français" },
  { value: "es", label: "🇪🇸 Español" },
  { value: "ru", label: "🇷🇺 Русский" },
  { value: "zh", label: "🇨🇳 中文" },
  { value: "ja", label: "🇯🇵 日本語" },
  { value: "ko", label: "🇰🇷 한국어" },
  { value: "pt", label: "🇧🇷 Português" },
  { value: "ar", label: "🇸🇦 العربية" },
  { value: "it", label: "🇮🇹 Italiano" },
] as const;

const TIMEZONES = [
  { value: "Europe/Istanbul", label: "Europe/Istanbul (UTC+3)" },
  { value: "Europe/London", label: "Europe/London (UTC+0)" },
  { value: "America/New_York", label: "America/New York (UTC-5)" },
  { value: "America/Los_Angeles", label: "America/Los Angeles (UTC-8)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (UTC+9)" },
  { value: "UTC", label: "UTC" },
];

const INTERVAL_OPTIONS = [
  { value: 5, label: "Every 5 minutes" },
  { value: 10, label: "Every 10 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every 1 hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Once a day" },
];

type KeyInfo = {
  configured: boolean;
  source: "user" | "instance" | "app" | "env" | null;
  masked: string | null;
};

// ── Section Title helper ─────────────────────────────────────────────
import { SectionTitle } from "@/components/settings/SectionTitle";

const ALL_TABS = [...BASE_TABS, ADMIN_TAB];
const ALL_TAB_IDS = ALL_TABS.map((t) => t.id);
const BASE_TAB_IDS = BASE_TABS.map((t) => t.id);

function SettingsContent() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const tabs = isAdmin ? ALL_TABS : BASE_TABS;
  const validIds = isAdmin ? ALL_TAB_IDS : BASE_TAB_IDS;

  const tabParam = searchParams.get("tab") || "general";
  const resolvedTab = validIds.includes(tabParam) ? tabParam : "general";
  const [activeTab, setActiveTab] = useState(resolvedTab);

  useEffect(() => {
    const tp = searchParams.get("tab") || "general";
    if (validIds.includes(tp)) {
      setActiveTab(tp);
    }
  }, [searchParams, validIds]);

  return (
    <>
      <Header title="Settings" subtitle="Account and app settings" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(String(v))} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 border-b border-border bg-card/50 px-6 py-2">
            <TabsList className="bg-transparent gap-1 h-auto p-0" variant="line">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="rounded-xl px-4 py-2.5 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm">
                    <Icon size={16} />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="general" className="flex-1 overflow-y-auto p-6 mt-0">
            <div className="mx-auto max-w-5xl">
              <GeneralSettings />
            </div>
          </TabsContent>
          <TabsContent value="ai" className="flex-1 overflow-y-auto p-6 mt-0">
            <div className="mx-auto max-w-5xl">
              <AISettingsTab />
            </div>
          </TabsContent>
          <TabsContent value="telegram" className="flex-1 overflow-y-auto p-6 mt-0">
            <div className="mx-auto max-w-5xl">
              <TelegramSettingsTab />
            </div>
          </TabsContent>
          <TabsContent value="notifications" className="flex-1 overflow-y-auto p-6 mt-0">
            <div className="mx-auto max-w-5xl">
              <NotificationRulesTab />
            </div>
          </TabsContent>
          <TabsContent value="data" className="flex-1 overflow-y-auto p-6 mt-0">
            <div className="mx-auto max-w-5xl">
              <DataTab />
            </div>
          </TabsContent>
          <TabsContent value="fever" className="flex-1 overflow-y-auto p-6 mt-0">
            <div className="mx-auto max-w-5xl">
              <FeverApiTab />
            </div>
          </TabsContent>
          {isAdmin && session?.user?.id && (
            <TabsContent value="users" className="flex-1 overflow-y-auto p-6 mt-0">
              <div className="mx-auto max-w-5xl">
                <UsersAdminTab currentUserId={session.user.id} />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <SettingsContent />
    </Suspense>
  );
}

// ── Secret Key Input Component ──────────────────────────────────────
function SecretKeyInput({
  label,
  description,
  placeholder,
  settingKey,
  keyInfo,
  onSaved,
  helpUrl,
  helpLabel,
}: {
  label: string;
  description: string;
  placeholder: string;
  settingKey: string;
  keyInfo: KeyInfo | null;
  onSaved: () => void;
  helpUrl?: string;
  helpLabel?: string;
}) {
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey, value: value.trim() }),
      });
      if (res.ok) {
        toast.success(`${label} saved successfully`);
        setValue("");
        onSaved();
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/settings/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey }),
      });
      if (res.ok) {
        toast.success(`${label} removed`);
        onSaved();
      } else {
        toast.error("Failed to remove");
      }
    } catch {
      toast.error("Failed to remove");
    } finally {
      setDeleting(false);
    }
  }

  const isConfigured = keyInfo?.configured;
  const source = keyInfo?.source;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {isConfigured && (
          <Badge variant="secondary" className={cn(
            source === "user" ? "bg-green-500/10 text-green-600" :
            source === "instance" ? "bg-amber-500/10 text-amber-600" :
            "bg-blue-500/10 text-blue-600"
          )}>
            {source === "user" ? "Your key" : source === "instance" ? "Instance key" : source === "app" ? "Saved in app" : "From .env"}
          </Badge>
        )}
      </div>

      {isConfigured && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <code className="flex-1 text-xs text-muted-foreground font-mono">
            {keyInfo?.masked}
          </code>
          {(source === "user" || source === "app") && (
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting} className="text-destructive hover:bg-destructive/10 hover:text-destructive h-auto py-1 px-2 text-xs">
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Remove
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
          <Input
            type={showValue ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder={isConfigured ? "Enter new key to replace..." : placeholder}
            className="pl-9 pr-10 rounded-xl py-2.5 h-auto font-mono"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowValue(!showValue)}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
          </Button>
        </div>
        <Button onClick={handleSave} disabled={saving || !value.trim()} className="rounded-xl">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </Button>
      </div>

      {helpUrl && (
        <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <ExternalLink size={10} />
          {helpLabel || "Get an API key"}
        </a>
      )}
    </div>
  );
}

// ── General Settings ─────────────────────────────────────────────────
function GeneralSettings() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [interval, setInterval] = useState(15);
  const [concurrency, setConcurrency] = useState(3);
  const [translateLang, setTranslateLang] = useState("tr");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("translateLanguage");
    if (stored) setTranslateLang(stored);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [profileRes, refreshRes] = await Promise.all([
          fetch("/api/settings/profile"),
          fetch("/api/settings/refresh"),
        ]);
        const profileData = await profileRes.json();
        const refreshData = await refreshRes.json();
        if (profileRes.ok && profileData.data) {
          setName(profileData.data.name || "");
          setUsername(profileData.data.username || "");
        }
        if (refreshRes.ok && refreshData.data) {
          setInterval(refreshData.data.intervalMinutes ?? 15);
          setConcurrency(refreshData.data.importConcurrency ?? 3);
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        fetch("/api/settings/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, username }),
        }),
        fetch("/api/settings/refresh", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intervalMinutes: interval, importConcurrency: concurrency }),
        }),
      ]);
      localStorage.setItem("translateLanguage", translateLang);
      toast.success("Settings updated");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="rounded-2xl h-48" />
          <Skeleton className="rounded-2xl h-48" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
    );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="rounded-2xl border border-border bg-card">
        <CardContent className="p-6">
          <SectionTitle icon={User} title="Profile" description="Your account details" />
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Username</label>
              <Input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Display Name</label>
              <Input type="text" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border bg-card">
        <CardContent className="p-6">
          <SectionTitle icon={RefreshCw} title="Feed Refresh" description="How often feeds are checked" />
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-medium"><Clock size={14} /> Refresh Interval</label>
              <select value={interval} onChange={(e) => setInterval(parseInt(e.target.value, 10))} className="w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50">
                {INTERVAL_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-medium"><Upload size={14} /> Import Concurrency</label>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={10} value={concurrency} onChange={(e) => setConcurrency(parseInt(e.target.value, 10))} className="flex-1 accent-primary" />
                <span className="w-8 text-center text-sm font-bold">{concurrency}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Parallel feeds during OPML import</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border bg-card lg:col-span-2">
        <CardContent className="p-6">
          <SectionTitle icon={Globe} title="Translation" description="Default language for article translation" />
          <div className="max-w-sm">
            <label className="mb-1.5 block text-sm font-medium">Preferred Language</label>
            <p className="text-xs text-muted-foreground mb-2">Articles will be translated to this language by default</p>
            <select
              value={translateLang}
              onChange={(e) => {
                setTranslateLang(e.target.value);
                localStorage.setItem("translateLanguage", e.target.value);
              }}
              className="w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              {LANGUAGES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border bg-card lg:col-span-2">
        <CardContent className="p-6">
          <SectionTitle icon={Lock} title="Change Password" description="Update your account password" />
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <div className="lg:col-span-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
        </Button>
      </div>
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleChange() {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success("Password updated");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error(d.error || "Failed to update password");
      }
    } catch {
      toast.error("Failed to update password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
      <Input
        type="password"
        placeholder="Current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className="rounded-xl"
      />
      <Input
        type="password"
        placeholder="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="rounded-xl"
      />
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleChange()}
          className="rounded-xl"
        />
        <Button
          onClick={handleChange}
          disabled={saving || !currentPassword || newPassword.length < 6 || newPassword !== confirmPassword}
          className="rounded-xl shrink-0"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
        </Button>
      </div>
    </div>
  );
}

// ── Ollama Connection Wizard ────────────────────────────────────────
function OllamaWizard({
  baseUrl,
  setBaseUrl,
  status,
  models,
  onTest,
  testing,
}: {
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  status: "unknown" | "connected" | "error";
  models: string[];
  onTest: () => void;
  testing: boolean;
}) {
  const isDocker = typeof window !== "undefined" && (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1");

  return (
    <Card className="rounded-2xl border border-border bg-card">
      <CardContent className="p-6">
        <SectionTitle icon={Server} title="Ollama Connection" description="Connect to your local Ollama server" />

        {isDocker && status !== "connected" && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700">Docker detected</p>
              <p className="text-xs text-amber-600 mt-1">
                Feed2040 is running in Docker. Use your host machine IP instead of <code className="bg-amber-200/30 px-1 rounded">localhost</code>.
                Try one of these:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {["http://host.docker.internal:11434/v1", "http://172.17.0.1:11434/v1"].map((url) => (
                  <Button
                    key={url}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBaseUrl(url)}
                    className="rounded-lg border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 text-[11px] font-mono h-auto py-1"
                  >
                    {url}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Server URL</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Server size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
                <Input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="pl-9 rounded-xl py-2.5 h-auto font-mono"
                />
              </div>
              <Button
                type="button"
                onClick={onTest}
                disabled={testing}
                variant={status === "connected" ? "outline" : "default"}
                className={cn(
                  status === "connected" && "bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/20 hover:text-green-700"
                )}
              >
                {testing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : status === "connected" ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Zap size={14} />
                )}
                {status === "connected" ? "Connected" : "Test Connection"}
              </Button>
            </div>
          </div>

          {status === "connected" && (
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} className="text-green-500" />
                <span className="text-sm font-medium text-green-700">Connected to Ollama</span>
              </div>
              <p className="text-xs text-green-600">
                {models.length} model{models.length !== 1 ? "s" : ""} available: {models.join(", ")}
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-red-500" />
                <span className="text-sm font-medium text-red-700">Connection failed</span>
              </div>
              <p className="text-xs text-red-600">
                Cannot reach Ollama at the specified URL. Make sure Ollama is running
                and the URL is correct.
              </p>
              <div className="mt-3 space-y-1 text-xs text-red-600/80">
                <p>Troubleshooting:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Check if Ollama is running: <code className="bg-red-200/30 px-1 rounded">ollama list</code></li>
                  <li>If Docker: use host IP, not localhost</li>
                  <li>Ensure Ollama allows external connections: <code className="bg-red-200/30 px-1 rounded">OLLAMA_HOST=0.0.0.0 ollama serve</code></li>
                </ul>
              </div>
            </div>
          )}

          <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink size={10} /> Browse available models on Ollama
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Model Selector (grid layout) ────────────────────────────────────
function ModelSelector({
  label, description, provider, value, onChange, icon, ollamaModels,
}: {
  label: string; description: string; provider: string; value: string;
  onChange: (v: string) => void; icon?: React.ReactNode; ollamaModels?: string[];
}) {
  if (provider === "ollama") {
    const available = ollamaModels || [];
    return (
      <div>
        <label className="mb-1 flex items-center gap-2 text-sm font-medium">{icon} {label}</label>
        <p className="text-xs text-muted-foreground mb-3">{description}</p>
        {available.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {available.map((m) => {
              const selected = value === m;
              return (
                <Button key={m} type="button" variant="outline" onClick={() => onChange(m)}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-4 py-3 h-auto text-sm transition-all text-left",
                    selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/30 hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn("h-2 w-2 rounded-full", selected ? "bg-primary" : "bg-muted-foreground/30")} />
                    <span className={cn("font-mono text-xs", selected && "font-medium")}>{m}</span>
                  </div>
                  <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-transparent text-[10px]">Local</Badge>
                </Button>
              );
            })}
          </div>
        ) : (
          <Input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. qwen3.5:9b" className="font-mono rounded-xl" />
        )}
      </div>
    );
  }

  const models = PROVIDER_MODELS[provider] || [];
  return (
    <div>
      <label className="mb-1 flex items-center gap-2 text-sm font-medium">{icon} {label}</label>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {models.map((m) => {
          const badge = TIER_BADGES[m.tier];
          const selected = value === m.value;
          return (
            <Button key={m.value} type="button" variant="outline" onClick={() => onChange(m.value)}
              className={cn(
                "flex items-center justify-between rounded-xl px-4 py-3 h-auto text-sm transition-all text-left",
                selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/30 hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn("h-2 w-2 rounded-full", selected ? "bg-primary" : "bg-muted-foreground/30")} />
                <span className={selected ? "font-medium" : ""}>{m.label}</span>
              </div>
              <Badge variant="secondary" className={cn("text-[10px]", badge.className)}>{badge.label}</Badge>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// ── AI Settings Tab ──────────────────────────────────────────────────
function AISettingsTab() {
  const [provider, setProvider] = useState("openai");
  const [savedProvider, setSavedProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [digestModel, setDigestModel] = useState("gpt-4o");
  const [language, setLanguage] = useState("en");
  const [autoSummarize, setAutoSummarize] = useState(false);
  const [openaiKeyInfo, setOpenaiKeyInfo] = useState<KeyInfo | null>(null);
  const [anthropicKeyInfo, setAnthropicKeyInfo] = useState<KeyInfo | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434/v1");
  const [ollamaStatus, setOllamaStatus] = useState<"unknown" | "connected" | "error">("unknown");
  const [ollamaTesting, setOllamaTesting] = useState(false);
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [briefingEnabled, setBriefingEnabled] = useState(false);
  const [briefingTimes, setBriefingTimes] = useState<string[]>([]);
  const [briefingTimezone, setBriefingTimezone] = useState("Europe/Istanbul");
  const [briefingHours, setBriefingHours] = useState(24);
  const [briefingCategories, setBriefingCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<{ id: string; name: string }[]>([]);

  const testOllamaConnection = useCallback(async (baseUrl: string) => {
    setOllamaTesting(true);
    try {
      const res = await fetch("/api/settings/ai/test-ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl }),
      });
      const data = await res.json();
      if (res.ok && data.data?.models) {
        setOllamaModels(data.data.models);
        setOllamaStatus("connected");
        return data.data.models as string[];
      }
      setOllamaStatus("error");
    } catch {
      setOllamaStatus("error");
      setOllamaModels([]);
    } finally {
      setOllamaTesting(false);
    }
    return [] as string[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [aiRes, keysRes, catsRes] = await Promise.all([
          fetch("/api/settings/ai"),
          fetch("/api/settings/keys"),
          fetch("/api/categories"),
        ]);
        if (cancelled) return;
        const aiData = await aiRes.json();
        const keysData = await keysRes.json();
        const catsData = await catsRes.json();

        if (aiRes.ok && aiData.data) {
          const p = aiData.data.provider || "openai";
          setProvider(p);
          setSavedProvider(p);
          setModel(aiData.data.model || "gpt-4o-mini");
          setDigestModel(aiData.data.digestModel || "gpt-4o");
          setLanguage(aiData.data.language || "en");
          setAutoSummarize(aiData.data.autoSummarize ?? false);
          const savedUrl = aiData.data.ollamaBaseUrl || "http://localhost:11434/v1";
          setOllamaBaseUrl(savedUrl);
          setOpenaiBaseUrl(aiData.data.openaiBaseUrl || "");
          setAnthropicBaseUrl(aiData.data.anthropicBaseUrl || "");
          if (p === "ollama") {
            testOllamaConnection(savedUrl);
          }
          setBriefingEnabled(aiData.data.briefingEnabled ?? false);
          setBriefingTimes(aiData.data.briefingTimes ?? []);
          setBriefingTimezone(aiData.data.briefingTimezone || "Europe/Istanbul");
          setBriefingHours(aiData.data.briefingHours ?? 24);
          setBriefingCategories(aiData.data.briefingCategories ?? []);
        }
        if (keysRes.ok && keysData.data) {
          if (keysData.data.openai) setOpenaiKeyInfo(keysData.data.openai);
          if (keysData.data.anthropic) setAnthropicKeyInfo(keysData.data.anthropic);
        }
        if (catsRes.ok && catsData.data) {
          const flat: { id: string; name: string }[] = [];
          const collect = (c: { id: string; name: string; children?: unknown[] }) => {
            flat.push({ id: c.id, name: c.name });
            if (Array.isArray(c.children)) {
              for (const ch of c.children) collect(ch as { id: string; name: string; children?: unknown[] });
            }
          };
          (Array.isArray(catsData.data) ? catsData.data : []).forEach(collect);
          setAllCategories(flat);
        }
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [testOllamaConnection]);

  const refreshKeyInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/keys");
      const data = await res.json();
      if (res.ok && data.data) {
        if (data.data.openai) setOpenaiKeyInfo(data.data.openai);
        if (data.data.anthropic) setAnthropicKeyInfo(data.data.anthropic);
      }
    } catch { /* silent */ }
  }, []);

  function handleKeySaved() {
    refreshKeyInfo();
  }

  function handleProviderChange(newProvider: string) {
    setProvider(newProvider);
    if (newProvider === "ollama") {
      testOllamaConnection(ollamaBaseUrl).then((models) => {
        if (models.length > 0) {
          setModel(models[0]);
          setDigestModel(models[0]);
        }
      });
      return;
    }
    const models = PROVIDER_MODELS[newProvider];
    if (models && newProvider !== savedProvider) {
      const fast = models.find((m) => m.tier === "fast");
      const powerful = models.find((m) => m.tier === "powerful" || m.tier === "balanced");
      if (fast) setModel(fast.value);
      if (powerful) setDigestModel(powerful.value);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        provider, model, digestModel, language, autoSummarize,
        briefingEnabled, briefingTimes, briefingTimezone, briefingHours, briefingCategories,
      };
      if (provider === "ollama") payload.ollamaBaseUrl = ollamaBaseUrl;
      if (openaiBaseUrl) payload.openaiBaseUrl = openaiBaseUrl;
      else payload.openaiBaseUrl = null;
      if (anthropicBaseUrl) payload.anthropicBaseUrl = anthropicBaseUrl;
      else payload.anthropicBaseUrl = null;
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("AI settings saved");
        setSavedProvider(provider);
      } else {
        const d = await res.json();
        toast.error(d.error);
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton className="rounded-2xl h-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="rounded-2xl h-48" />
          <Skeleton className="rounded-2xl h-48" />
        </div>
        <Skeleton className="rounded-2xl h-48" />
      </div>
    );

  const isOllama = provider === "ollama";
  const isKeyConfigured = isOllama ? ollamaStatus === "connected" : (provider === "openai" ? openaiKeyInfo?.configured : anthropicKeyInfo?.configured);

  const providerMeta: Record<string, { label: string; desc: string; placeholder: string; key: string; helpUrl: string; helpLabel: string }> = {
    openai: { label: "OpenAI API Key", desc: "Required to use GPT models", placeholder: "sk-...", key: "openai_api_key", helpUrl: "https://platform.openai.com/api-keys", helpLabel: "Get your API key from OpenAI" },
    anthropic: { label: "Anthropic API Key", desc: "Required to use Claude models", placeholder: "sk-ant-...", key: "anthropic_api_key", helpUrl: "https://console.anthropic.com/settings/keys", helpLabel: "Get your API key from Anthropic" },
  };

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <Card className="rounded-2xl border border-border bg-card">
        <CardContent className="p-6">
          <SectionTitle icon={Cpu} title="AI Provider" description="Choose which AI service to use for summarization and digests" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PROVIDERS.map((p) => {
              const isSelected = provider === p.value;
              const ki = p.value === "ollama"
                ? ollamaStatus === "connected"
                : p.value === "openai" ? openaiKeyInfo?.configured : anthropicKeyInfo?.configured;
              return (
                <Button
                  key={p.value}
                  type="button"
                  variant="outline"
                  onClick={() => handleProviderChange(p.value)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-xl p-5 h-auto text-sm transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                      : "border-border hover:border-primary/30 hover:bg-muted/50"
                  )}
                >
                  <span className="text-3xl">{p.icon}</span>
                  <span className={cn("font-medium", isSelected && "font-semibold")}>{p.label}</span>
                  <span className="text-[11px] text-muted-foreground">{p.description}</span>
                  {ki ? (
                    <span className="flex items-center gap-1 text-[10px] text-green-600 mt-1">
                      <CheckCircle2 size={10} /> {p.value === "ollama" ? "Connected" : "Key set"}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground mt-1">
                      {p.value === "ollama" ? "Not connected" : "Key not set"}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Provider-specific configuration */}
      {isOllama ? (
        <OllamaWizard
          baseUrl={ollamaBaseUrl}
          setBaseUrl={setOllamaBaseUrl}
          status={ollamaStatus}
          models={ollamaModels}
          onTest={() => testOllamaConnection(ollamaBaseUrl)}
          testing={ollamaTesting}
        />
      ) : (
        <Card className="rounded-2xl border border-border bg-card">
          <CardContent className="p-6">
            <SectionTitle icon={Key} title="API Key" description={`Configure your ${provider === "openai" ? "OpenAI" : "Anthropic"} credentials`} />
            <SecretKeyInput
              label={providerMeta[provider].label}
              description={providerMeta[provider].desc}
              placeholder={providerMeta[provider].placeholder}
              settingKey={providerMeta[provider].key}
              keyInfo={provider === "openai" ? openaiKeyInfo : anthropicKeyInfo}
              onSaved={handleKeySaved}
              helpUrl={providerMeta[provider].helpUrl}
              helpLabel={providerMeta[provider].helpLabel}
            />
            <Separator className="my-4" />
            <div className="space-y-2">
              <label className="text-sm font-medium">Custom API URL <span className="text-muted-foreground font-normal">(optional)</span></label>
              <p className="text-xs text-muted-foreground">Use a custom endpoint for {provider === "openai" ? "OpenAI-compatible" : "Anthropic-compatible"} APIs (e.g. Azure OpenAI, proxy, local gateway)</p>
              <Input
                type="url"
                placeholder={provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com"}
                value={provider === "openai" ? openaiBaseUrl : anthropicBaseUrl}
                onChange={(e) => provider === "openai" ? setOpenaiBaseUrl(e.target.value) : setAnthropicBaseUrl(e.target.value)}
                className="rounded-xl font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Model Selection */}
      <Card className={cn("rounded-2xl border border-border bg-card", !isKeyConfigured && "opacity-60")}>
        <CardContent className="p-6">
          <SectionTitle icon={Sparkles} title="Model Configuration" description="Select which models to use for different tasks" />

          {!isKeyConfigured && (
            <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-700">
                {isOllama
                  ? "Connect to your Ollama server to enable model selection."
                  : `Add your ${provider === "openai" ? "OpenAI" : "Anthropic"} API key to enable model selection.`}
              </p>
            </div>
          )}

          <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-6", !isKeyConfigured && "pointer-events-none")}>
            <ModelSelector
              label="Article Summarization"
              description="For individual article summaries. Faster models are more cost-effective."
              provider={provider} value={model} onChange={setModel}
              icon={<Sparkles size={14} />} ollamaModels={ollamaModels}
            />
            <ModelSelector
              label="Daily Digest"
              description="For daily briefing generation. More capable models produce deeper analysis."
              provider={provider} value={digestModel} onChange={setDigestModel}
              icon={<Bot size={14} />} ollamaModels={ollamaModels}
            />
          </div>
        </CardContent>
      </Card>

      {/* Scheduled Daily Briefing */}
      <Card className="rounded-2xl border border-border bg-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Clock size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Scheduled Daily Briefing</h3>
                <p className="text-sm text-muted-foreground">Automatically generate briefings at scheduled times</p>
              </div>
            </div>
            <Switch checked={briefingEnabled} onCheckedChange={setBriefingEnabled} />
          </div>

          {briefingEnabled && (
            <>
              <Separator className="mb-5" />
              <div className="space-y-5">
                {/* Schedule Times */}
                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium">Schedule Times</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {briefingTimes.map((t, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Input
                          type="time"
                          value={t}
                          onChange={(e) => setBriefingTimes((prev) => { const next = [...prev]; next[i] = e.target.value; return next; })}
                          className="rounded-lg w-auto"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setBriefingTimes((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setBriefingTimes((prev) => [...prev, "09:00"])}
                      className="rounded-lg border-dashed"
                    >
                      + Add time
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">Timezone</label>
                    <select
                      value={briefingTimezone}
                      onChange={(e) => setBriefingTimezone(e.target.value)}
                      className="w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">Time Range</label>
                    <select
                      value={briefingHours}
                      onChange={(e) => setBriefingHours(parseInt(e.target.value))}
                      className="w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
                    >
                      <option value={12}>Last 12 hours</option>
                      <option value={24}>Last 24 hours</option>
                      <option value={48}>Last 48 hours</option>
                      <option value={72}>Last 3 days</option>
                      <option value={168}>Last 7 days</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">Briefing Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
                    >
                      {LANGUAGES.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {allCategories.length > 0 && (
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                      Categories
                      <span className="text-xs text-muted-foreground font-normal">(empty = all)</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {allCategories.map((cat) => {
                        const sel = briefingCategories.includes(cat.id);
                        return (
                          <Button
                            key={cat.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setBriefingCategories((prev) =>
                              prev.includes(cat.id) ? prev.filter((c) => c !== cat.id) : [...prev, cat.id]
                            )}
                            className={cn(
                              "rounded-lg h-auto py-1",
                              sel
                                ? "border-primary bg-primary/10 text-primary font-medium"
                                : "border-border hover:border-primary/30 text-muted-foreground"
                            )}
                          >
                            {cat.name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {briefingTimes.length === 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
                    <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-700">Add at least one schedule time for automatic briefing generation.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Save AI Settings
      </Button>
    </div>
  );
}

// ── Telegram Settings Tab ────────────────────────────────────────────
function TelegramSettingsTab() {
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [connectToken, setConnectToken] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [keysRes, settingsRes, botRes] = await Promise.all([
        fetch("/api/settings/keys"),
        fetch("/api/settings/telegram"),
        fetch("/api/settings/telegram/bot-info"),
      ]);
      const keysData = await keysRes.json();
      const settingsData = await settingsRes.json();
      const botData = await botRes.json();

      if (keysRes.ok && keysData.data?.telegram) setKeyInfo(keysData.data.telegram);
      if (settingsRes.ok && settingsData.data) {
        setConnected(true);
      } else {
        setConnected(false);
      }
      if (botRes.ok && botData.data?.botUsername) setBotUsername(botData.data.botUsername);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleGenerateToken() {
    setGeneratingToken(true);
    try {
      const res = await fetch("/api/settings/telegram/connect-token", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.data?.token) { setConnectToken(data.data.token); toast.success("Token generated!"); }
      else toast.error(data.error || "Failed to generate token");
    } catch { toast.error("Failed to generate token"); }
    finally { setGeneratingToken(false); }
  }

  

  async function handleTestMessage() {
    setTesting(true);
    try {
      const res = await fetch("/api/telegram/test", { method: "POST" });
      const data = await res.json();
      if (res.ok) toast.success("Test message sent!");
      else toast.error(data.error || "Failed to send");
    } catch { toast.error("Failed to send test message"); }
    finally { setTesting(false); }
  }

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="rounded-2xl h-48" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="rounded-2xl h-48" />
        <Skeleton className="rounded-2xl h-48" />
      </div>
    </div>
  );

  const botConfigured = keyInfo?.configured;

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border bg-card">
        <CardContent className="p-6">
          <SectionTitle icon={Bot} title="Bot Token" description="Create a bot via @BotFather on Telegram" />
          <SecretKeyInput
            label="Telegram Bot Token"
            description="Required to send digest messages"
            placeholder="123456:ABC-DEF..."
            settingKey="telegram_bot_token"
            keyInfo={keyInfo}
            onSaved={fetchData}
            helpUrl="https://t.me/BotFather"
            helpLabel="Create a bot with @BotFather"
          />
        </CardContent>
      </Card>

      {botConfigured && (
        <Card className="rounded-2xl border border-border bg-card">
          <CardContent className="p-6">
            <SectionTitle
              icon={connected ? CheckCircle2 : ArrowRight}
              title={connected ? "Connected" : "Connect Account"}
              description={connected ? "Your Telegram account is linked" : "Link your Telegram account to receive digests"}
            />
            {!connected && (
              <div className="space-y-3">
                <Button onClick={handleGenerateToken} disabled={generatingToken}>
                  {generatingToken ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Generate connection token
                </Button>
                {connectToken && (
                  <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Send this to {botUsername ? <span className="font-semibold">@{botUsername}</span> : "the bot"}:
                    </p>
                    <p className="font-mono font-semibold text-sm break-all">/start {connectToken}</p>
                    {botUsername && (
                      <a href={`https://t.me/${botUsername}?start=${connectToken}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink size={10} /> Open in Telegram
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
            {connected && (
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleTestMessage} disabled={testing}>
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Test Message
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Notification Rules Tab ─── */
type NotificationRule = { id: string; name: string; keywords: string[]; isActive: boolean; notifyTelegram: boolean };

function NotificationRulesTab() {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [newTelegram, setNewTelegram] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/notification-rules");
      const data = await res.json();
      if (res.ok) setRules(data.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  async function handleCreate() {
    if (!newName.trim() || !newKeywords.trim()) return;
    setCreating(true);
    try {
      const keywords = newKeywords.split(",").map((k) => k.trim()).filter(Boolean);
      const res = await fetch("/api/notification-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, keywords, notifyTelegram: newTelegram }),
      });
      if (res.ok) { toast.success("Rule created"); setNewName(""); setNewKeywords(""); setShowForm(false); fetchRules(); }
      else { const data = await res.json(); toast.error(data.error || "Failed"); }
    } catch { toast.error("Failed"); }
    finally { setCreating(false); }
  }

  async function handleToggle(id: string, isActive: boolean) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, isActive: !isActive } : r)));
    try { await fetch(`/api/notification-rules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !isActive }) }); }
    catch { setRules((prev) => prev.map((r) => (r.id === id ? { ...r, isActive } : r))); }
  }

  async function handleDelete(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
    try { await fetch(`/api/notification-rules/${id}`, { method: "DELETE" }); toast.success("Rule deleted"); }
    catch { fetchRules(); toast.error("Failed"); }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border bg-card">
        <CardContent className="p-6">
          <SectionTitle icon={Shield} title="Notification Rules" description="Get alerted when new articles match your keywords via Telegram" />

          {loading ? (
            <div className="flex justify-center py-8">
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-3 rounded-xl border border-border p-4">
                  <Switch checked={rule.isActive} onCheckedChange={() => handleToggle(rule.id, rule.isActive)} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", !rule.isActive && "text-muted-foreground")}>{rule.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {rule.keywords.map((kw) => (
                        <Badge key={kw} variant="secondary" className="bg-primary/10 text-primary text-[10px] font-medium">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {rule.notifyTelegram && <span title="Telegram alerts"><Bot size={14} className="text-muted-foreground shrink-0" /></span>}
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}

              {showForm ? (
                <div className="rounded-xl border border-border p-4 space-y-4 bg-muted/30">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Rule Name</label>
                      <Input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., Critical CVEs"
                        className="mt-1 rounded-xl" maxLength={100} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Keywords (comma separated)</label>
                      <Input type="text" value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} placeholder="CVE, ransomware, zero-day"
                        className="mt-1 rounded-xl" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Switch checked={newTelegram} onCheckedChange={setNewTelegram} />
                      Send Telegram notifications
                    </label>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                      <Button onClick={handleCreate} disabled={creating || !newName.trim() || !newKeywords.trim()}>
                        {creating ? "Creating..." : "Create Rule"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setShowForm(true)}
                  className="rounded-xl border-dashed w-full justify-center h-auto py-3">
                  <Shield size={16} /> Add Notification Rule
                </Button>
              )}

              {rules.length === 0 && !showForm && (
                <p className="text-sm text-muted-foreground text-center py-4">No notification rules yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Data Tab (Import & Export) ──────────────────────────────────────
function DataTab() {
  const [importing, setImporting] = useState(false);
  const [exportingOpml, setExportingOpml] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);

  async function handleImportOpml() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".opml,.xml";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const text = await file.text();
        const res = await fetch("/api/opml", {
          method: "POST",
          headers: { "Content-Type": "application/xml" },
          body: text,
        });
        if (res.ok) {
          toast.success("OPML imported successfully");
        } else {
          const data = await res.json();
          toast.error(data.error || "Import failed");
        }
      } catch {
        toast.error("Import failed");
      } finally {
        setImporting(false);
      }
    };
    input.click();
  }

  async function handleExportOpml() {
    setExportingOpml(true);
    try {
      const res = await fetch("/api/opml");
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `feed2040-export-${new Date().toISOString().slice(0, 10)}.opml`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("OPML exported");
      }
    } catch {
      toast.error("Export failed");
    } finally {
      setExportingOpml(false);
    }
  }

  async function handleExportJson() {
    setExportingJson(true);
    try {
      const res = await fetch("/api/export/json");
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `feed2040-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("JSON backup exported");
      }
    } catch {
      toast.error("Export failed");
    } finally {
      setExportingJson(false);
    }
  }

  async function handleImportJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const text = await file.text();
        const res = await fetch("/api/import/json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: text,
        });
        if (res.ok) {
          toast.success("JSON backup imported successfully");
        } else {
          const data = await res.json();
          toast.error(data.error || "Import failed");
        }
      } catch {
        toast.error("Import failed");
      } finally {
        setImporting(false);
      }
    };
    input.click();
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border bg-card">
        <CardContent className="p-6">
          <SectionTitle icon={Upload} title="Import Feeds" description="Import feeds from OPML or JSON backup files" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                  <Upload size={18} className="text-blue-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Import OPML</p>
                  <p className="text-xs text-muted-foreground">Standard RSS reader export format</p>
                </div>
              </div>
              <Button onClick={handleImportOpml} disabled={importing} variant="outline" className="w-full rounded-xl">
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {importing ? "Importing..." : "Select OPML File"}
              </Button>
            </div>
            <div className="rounded-xl border border-border p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/10">
                  <Upload size={18} className="text-green-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Import JSON Backup</p>
                  <p className="text-xs text-muted-foreground">Restore from a Feed2040 backup file</p>
                </div>
              </div>
              <Button onClick={handleImportJson} disabled={importing} variant="outline" className="w-full rounded-xl">
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {importing ? "Importing..." : "Select JSON File"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border bg-card">
        <CardContent className="p-6">
          <SectionTitle icon={ArrowRight} title="Export Data" description="Export your feeds and data for backup or migration" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
                  <ArrowRight size={18} className="text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Export OPML</p>
                  <p className="text-xs text-muted-foreground">Compatible with all RSS readers</p>
                </div>
              </div>
              <Button onClick={handleExportOpml} disabled={exportingOpml} variant="outline" className="w-full rounded-xl">
                {exportingOpml ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                {exportingOpml ? "Exporting..." : "Download OPML"}
              </Button>
            </div>
            <div className="rounded-xl border border-border p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10">
                  <ArrowRight size={18} className="text-purple-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Export JSON Backup</p>
                  <p className="text-xs text-muted-foreground">Complete backup including articles, bookmarks, and categories</p>
                </div>
              </div>
              <Button onClick={handleExportJson} disabled={exportingJson} variant="outline" className="w-full rounded-xl">
                {exportingJson ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                {exportingJson ? "Exporting..." : "Download JSON"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Fever API Settings ──────────────────────────────────────────────
function FeverApiTab() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetch("/api/settings/fever")
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          setEnabled(d.data.enabled);
          setApiKey(d.data.apiKeyMasked || d.data.apiKey || null);
          setUsername(d.data.username);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    if (!password) {
      toast.error("Please enter a password");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/settings/fever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", password }),
      });
      const d = await res.json();
      if (d.data) {
        setEnabled(true);
        setApiKey(d.data.apiKey);
        setPassword("");
        toast.success("Fever API key generated");
      }
    } catch {
      toast.error("Failed to generate API key");
    } finally {
      setGenerating(false);
    }
  };

  const handleDisable = async () => {
    try {
      await fetch("/api/settings/fever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable" }),
      });
      setEnabled(false);
      setApiKey(null);
      toast.success("Fever API disabled");
    } catch {
      toast.error("Failed to disable");
    }
  };

  const handleCopy = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      toast.success("API key copied");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const endpoint = typeof window !== "undefined"
    ? `${window.location.origin}/api/fever`
    : "/api/fever";

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={Wifi}
        title="Fever API"
        description="Connect native RSS reader apps like Reeder, Fluent Reader, or Read You"
      />

      <Card className="rounded-2xl border border-border bg-card">
        <CardContent className="p-6 space-y-5">
          {enabled && apiKey ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-green-400">
                <CheckCircle2 size={16} />
                <span>Fever API is enabled</span>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">API Endpoint</label>
                <div className="flex items-center gap-2">
                  <Input value={endpoint} readOnly className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(endpoint);
                      toast.success("Endpoint copied");
                    }}
                  >
                    <Copy size={14} />
                  </Button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">API Key</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={showKey ? apiKey : "••••••••••••••••"}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={() => setShowKey((s) => !s)}>
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleCopy}>
                    <Copy size={14} />
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/50 p-4">
                <p className="text-sm font-medium mb-2">How to connect</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                  <li>Open your RSS reader app (Reeder, Fluent Reader, Read You, etc.)</li>
                  <li>Choose &quot;Fever&quot; as the sync service</li>
                  <li>Enter the API endpoint above as the server URL</li>
                  <li>Use your username <strong className="text-foreground">{username}</strong> and the password you set</li>
                </ol>
              </div>

              <Button variant="destructive" size="sm" onClick={handleDisable}>
                <Trash2 size={14} className="mr-2" />
                Disable Fever API
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Enable the Fever API to sync your feeds with native RSS reader apps.
                Enter a password to generate your API key.
              </p>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Username</label>
                <Input value={username} readOnly className="text-sm" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a password for Fever API"
                  className="text-sm"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  This can be different from your login password
                </p>
              </div>

              <Button onClick={handleGenerate} disabled={generating || !password}>
                {generating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Key size={14} className="mr-2" />}
                Generate API Key
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
