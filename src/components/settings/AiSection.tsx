"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Loader2, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { CardSkeleton, LANGUAGES, Note, SaveBar, Select, SettingRow, SettingsCard, StatusBadge } from "./primitives";
import { SecretKeyField, type KeyInfo } from "./SecretKeyField";

const OPENAI_URL = "https://api.openai.com/v1";

type AiConfig = {
  baseUrl: string;
  model: string;
  digestModel: string;
  embeddingModel: string;
  language: string;
};

const DEFAULTS: AiConfig = {
  baseUrl: "",
  model: "gpt-4o-mini",
  digestModel: "gpt-4o",
  embeddingModel: "text-embedding-3-small",
  language: "en",
};

export function AiSection() {
  const [saved, setSaved] = useState<AiConfig | null>(null);
  const [draft, setDraft] = useState<AiConfig>(DEFAULTS);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelsFrom, setModelsFrom] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  const loadKey = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/keys");
      const d = await res.json();
      if (res.ok) setKeyInfo(d.data?.openai ?? null);
    } catch {
      /* keep previous */
    }
  }, []);

  const loadModels = useCallback(async (baseUrl: string, quiet = false) => {
    const url = baseUrl.trim() || OPENAI_URL;
    setLoadingModels(true);
    try {
      const res = await fetch("/api/settings/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: url }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(d.data?.models)) {
        setModels([...d.data.models].sort());
        setModelsFrom(url);
        if (!quiet) toast.success(`Found ${d.data.models.length} models`);
      } else if (!quiet) {
        toast.error(d.error || "Couldn't load models from the provider");
      }
    } catch {
      if (!quiet) toast.error("Couldn't load models from the provider");
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings/ai");
        const d = await res.json();
        const c: AiConfig = {
          baseUrl: d.data?.baseUrl || "",
          model: d.data?.model || DEFAULTS.model,
          digestModel: d.data?.digestModel || DEFAULTS.digestModel,
          embeddingModel: d.data?.embeddingModel || DEFAULTS.embeddingModel,
          language: d.data?.language || DEFAULTS.language,
        };
        setSaved(c);
        setDraft(c);
        loadModels(c.baseUrl, true);
      } catch {
        setSaved(DEFAULTS);
      }
    })();
    loadKey();
  }, [loadKey, loadModels]);

  if (!saved) {
    return (
      <div className="space-y-6">
        <CardSkeleton rows={3} />
        <CardSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProviderCard
        saved={saved}
        draft={draft}
        setDraft={setDraft}
        onSaved={(c) => setSaved(c)}
        keyInfo={keyInfo}
        onKeyChanged={loadKey}
        onBaseUrlSaved={(url) => loadModels(url, true)}
      />
      <ModelsCard
        saved={saved}
        draft={draft}
        setDraft={setDraft}
        onSaved={(c) => setSaved(c)}
        models={models}
        modelsFrom={modelsFrom}
        loadingModels={loadingModels}
        onLoadModels={() => loadModels(draft.baseUrl)}
      />
      <SemanticIndexCard />
    </div>
  );
}

type CardProps = {
  saved: AiConfig;
  draft: AiConfig;
  setDraft: (c: AiConfig) => void;
  onSaved: (c: AiConfig) => void;
};

async function putAi(body: Partial<Omit<AiConfig, "baseUrl">> & { baseUrl?: string | null }) {
  const res = await fetch("/api/settings/ai", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  return { ok: res.ok, error: d.error as string | undefined };
}

function ProviderCard({
  saved,
  draft,
  setDraft,
  onSaved,
  keyInfo,
  onKeyChanged,
  onBaseUrlSaved,
}: CardProps & { keyInfo: KeyInfo | null; onKeyChanged: () => void; onBaseUrlSaved: (url: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string; detail?: string } | null>(null);

  const dirty = draft.baseUrl.trim() !== saved.baseUrl;
  const urlError = draft.baseUrl.trim() && !/^https?:\/\/\S+$/i.test(draft.baseUrl.trim()) ? "Must start with http:// or https://" : null;

  async function save() {
    setSaving(true);
    const url = draft.baseUrl.trim();
    const r = await putAi({ baseUrl: url || null }).catch(() => ({ ok: false, error: undefined }));
    setSaving(false);
    if (r.ok) {
      onSaved({ ...saved, baseUrl: url });
      toast.success(url ? "Endpoint saved" : "Using OpenAI directly");
      onBaseUrlSaved(url);
    } else {
      toast.error(r.error || "Couldn't save the endpoint");
    }
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch("/api/settings/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: draft.model, baseUrl: draft.baseUrl.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.data) {
        setTest({ ok: true, text: `${d.data.model} answered in ${d.data.responseTime} ms`, detail: d.data.responsePreview });
      } else {
        setTest({ ok: false, text: d.error || "The provider didn't answer" });
      }
    } catch {
      setTest({ ok: false, text: "Couldn't reach the server" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <SettingsCard
      title="Provider"
      description="Any OpenAI-compatible API: OpenAI, a proxy such as OpenRouter or LiteLLM, or a local Ollama."
      footer={
        <SaveBar
          dirty={dirty}
          saving={saving}
          disabled={!!urlError}
          onSave={save}
          onDiscard={() => setDraft({ ...draft, baseUrl: saved.baseUrl })}
          label="Save endpoint"
        />
      }
    >
      <SettingRow label="API key" description="Stored encrypted. Not needed for a local Ollama.">
        <div className="max-w-xl">
          <SecretKeyField
            name="API key"
            settingKey="openai_api_key"
            keyInfo={keyInfo}
            placeholder="sk-…"
            onSaved={onKeyChanged}
          />
        </div>
      </SettingRow>
      <SettingRow
        label="Endpoint"
        description={
          <>
            Leave empty to use OpenAI directly. For Ollama use <code className="font-mono text-[12px]">http://host:11434/v1</code>.
          </>
        }
        htmlFor="ai-base-url"
      >
        <Input
          id="ai-base-url"
          type="url"
          inputMode="url"
          value={draft.baseUrl}
          onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
          placeholder={OPENAI_URL}
          spellCheck={false}
          aria-invalid={!!urlError}
          aria-describedby={urlError ? "ai-base-url-err" : undefined}
          className="max-w-xl font-mono text-[13px]"
        />
        {urlError && (
          <p id="ai-base-url-err" className="mt-1.5 text-[13px] text-destructive">
            {urlError}
          </p>
        )}
      </SettingRow>
      <SettingRow label="Check connection" description="Sends a short prompt with the summary model below.">
        <div className="space-y-2.5">
          <Button variant="outline" onClick={runTest} disabled={testing || !draft.model}>
            {testing ? <Loader2 className="animate-spin" aria-hidden /> : <Zap aria-hidden />}
            {testing ? "Testing…" : "Test connection"}
          </Button>
          <div aria-live="polite">
            {test && (
              <Note tone={test.ok ? "success" : "danger"}>
                <span className="flex items-center gap-2 font-medium">
                  {test.ok ? <CheckCircle2 size={14} aria-hidden /> : <AlertTriangle size={14} aria-hidden />}
                  {test.text}
                </span>
                {test.detail && <span className="mt-1 block opacity-80">“{test.detail}”</span>}
              </Note>
            )}
          </div>
        </div>
      </SettingRow>
    </SettingsCard>
  );
}

const looksLikeEmbedding = (m: string) => /embed|bge|e5-|gte-|nomic|minilm/i.test(m);

function ModelField({
  id,
  value,
  onChange,
  models,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  models: string[];
  placeholder: string;
}) {
  const listId = `${id}-options`;
  const unknown = models.length > 0 && value.trim() !== "" && !models.includes(value.trim());
  return (
    <div className="max-w-xl">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={models.length ? listId : undefined}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="font-mono text-[13px]"
      />
      {models.length > 0 && (
        <datalist id={listId}>
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      )}
      {unknown && (
        <p className="mt-1.5 text-[13px] text-amber-700 dark:text-amber-400">
          Not in the provider&apos;s model list — check the spelling.
        </p>
      )}
    </div>
  );
}

function ModelsCard({
  saved,
  draft,
  setDraft,
  onSaved,
  models,
  modelsFrom,
  loadingModels,
  onLoadModels,
}: CardProps & {
  models: string[];
  modelsFrom: string | null;
  loadingModels: boolean;
  onLoadModels: () => void;
}) {
  const uid = useId();
  const [saving, setSaving] = useState(false);
  const embeddingModels = models.filter(looksLikeEmbedding);
  const keys = ["model", "digestModel", "embeddingModel", "language"] as const;
  const dirty = keys.some((k) => draft[k].trim() !== saved[k]);
  const empty = !draft.model.trim() || !draft.digestModel.trim() || !draft.embeddingModel.trim();

  async function save() {
    setSaving(true);
    const body = {
      model: draft.model.trim(),
      digestModel: draft.digestModel.trim(),
      embeddingModel: draft.embeddingModel.trim(),
      language: draft.language,
    };
    const r = await putAi(body).catch(() => ({ ok: false, error: undefined }));
    setSaving(false);
    if (r.ok) {
      onSaved({ ...saved, ...body });
      toast.success("AI settings saved");
    } else {
      toast.error(r.error || "Couldn't save AI settings");
    }
  }

  return (
    <SettingsCard
      title="Models & language"
      description="Type a model name or pick one from your provider's list."
      action={
        <div className="flex items-center gap-2">
          {models.length > 0 && modelsFrom && (
            <StatusBadge tone="info">{models.length} models available</StatusBadge>
          )}
          <Button variant="outline" size="sm" onClick={onLoadModels} disabled={loadingModels}>
            {loadingModels ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            {models.length ? "Reload list" : "Load model list"}
          </Button>
        </div>
      }
      footer={
        <SaveBar
          dirty={dirty}
          saving={saving}
          disabled={empty}
          onSave={save}
          onDiscard={() => setDraft({ ...draft, ...Object.fromEntries(keys.map((k) => [k, saved[k]])) })}
        />
      }
    >
      <SettingRow
        label="Response language"
        description="Summaries, answers and daily briefings are written in this language."
        htmlFor={`${uid}-lang`}
      >
        <Select
          id={`${uid}-lang`}
          value={draft.language}
          onChange={(e) => setDraft({ ...draft, language: e.target.value })}
          className="max-w-sm"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
      </SettingRow>
      <SettingRow
        label="Summaries & questions"
        description="Used for article summaries and Ask AI. A fast, cheap model works well."
        htmlFor={`${uid}-model`}
      >
        <ModelField
          id={`${uid}-model`}
          value={draft.model}
          onChange={(v) => setDraft({ ...draft, model: v })}
          models={models}
          placeholder={DEFAULTS.model}
        />
      </SettingRow>
      <SettingRow
        label="Daily briefing"
        description="Reads many articles at once; a more capable model gives better briefings."
        htmlFor={`${uid}-digest`}
      >
        <ModelField
          id={`${uid}-digest`}
          value={draft.digestModel}
          onChange={(v) => setDraft({ ...draft, digestModel: v })}
          models={models}
          placeholder={DEFAULTS.digestModel}
        />
      </SettingRow>
      <SettingRow
        label="Embeddings"
        description="For semantic search and related articles. Must produce 1536-dimension vectors."
        htmlFor={`${uid}-embed`}
      >
        <ModelField
          id={`${uid}-embed`}
          value={draft.embeddingModel}
          onChange={(v) => setDraft({ ...draft, embeddingModel: v })}
          models={embeddingModels.length ? embeddingModels : models}
          placeholder={DEFAULTS.embeddingModel}
        />
        {embeddingModels.length > 0 && !looksLikeEmbedding(draft.embeddingModel) && (
          <p className="mt-1.5 text-[13px] text-amber-700 dark:text-amber-400">
            This looks like a chat model. Pick an embedding model, e.g. {embeddingModels.slice(0, 2).join(" or ")}.
          </p>
        )}
      </SettingRow>
    </SettingsCard>
  );
}

function SemanticIndexCard() {
  const [status, setStatus] = useState<{ total: number; embedded: number; remaining: number } | null>(null);
  const [building, setBuilding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/articles/embed-backfill");
      const data = await res.json();
      if (res.ok) setStatus(data.data);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function build() {
    setBuilding(true);
    try {
      for (let i = 0; i < 200; i++) {
        const res = await fetch("/api/articles/embed-backfill", { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 422) toast.error(data.error || "Your AI provider doesn't return embeddings.", { duration: 10000 });
          else if (res.status === 429) toast.message("Rate limited — paused. Click again to continue.");
          else toast.error(data.error || "Indexing failed");
          break;
        }
        setStatus((prev) => (prev ? { ...prev, embedded: prev.total - data.data.remaining, remaining: data.data.remaining } : prev));
        if (data.data.done || data.data.embedded === 0) {
          toast.success("Semantic index is up to date");
          break;
        }
      }
    } finally {
      setBuilding(false);
      load();
    }
  }

  const pct = status && status.total > 0 ? Math.round((status.embedded / status.total) * 100) : 0;
  const upToDate = !!status && status.total > 0 && status.remaining === 0;

  return (
    <SettingsCard
      title="Semantic search"
      description="Indexes articles by meaning for semantic search and related articles. Indexing only runs when you start it, so run it again after new articles arrive."
    >
      <SettingRow label="Index" description={status ? `${status.embedded.toLocaleString()} of ${status.total.toLocaleString()} articles indexed` : "Checking…"}>
        <div className="flex max-w-xl flex-wrap items-center gap-3">
          <Progress value={pct} className="h-1.5 min-w-40 flex-1" aria-label={`${pct}% indexed`} />
          <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{pct}%</span>
          <Button variant={upToDate ? "outline" : "default"} onClick={build} disabled={building || upToDate}>
            {building ? <Loader2 className="animate-spin" aria-hidden /> : <Database aria-hidden />}
            {building ? "Indexing…" : upToDate ? "Up to date" : `Index ${status?.remaining.toLocaleString() ?? ""} articles`}
          </Button>
        </div>
      </SettingRow>
    </SettingsCard>
  );
}
