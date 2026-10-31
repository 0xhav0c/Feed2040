"use client";

import { useId, useState } from "react";
import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PasswordInput, StatusBadge } from "./primitives";

export type KeyInfo = {
  configured: boolean;
  source: "user" | "instance" | "app" | "env" | null;
  masked: string | null;
};

const SOURCE_LABEL: Record<NonNullable<KeyInfo["source"]>, string> = {
  user: "Your key",
  app: "Saved in app",
  instance: "Shared instance key",
  env: "From server .env",
};

/** Write-only secret: shows the masked current value, lets you replace or remove it. */
export function SecretKeyField({
  name,
  settingKey,
  keyInfo,
  placeholder,
  onSaved,
  helpUrl,
  helpLabel,
}: {
  /** human name used in messages, e.g. "API key" */
  name: string;
  settingKey: string;
  keyInfo: KeyInfo | null;
  placeholder: string;
  onSaved: () => void;
  helpUrl?: string;
  helpLabel?: string;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const configured = !!keyInfo?.configured;
  const source = keyInfo?.source ?? null;
  const removable = source === "user" || source === "app";

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey, value: value.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`${name} saved`);
        setValue("");
        onSaved();
      } else {
        toast.error(d.error || `Couldn't save the ${name.toLowerCase()}`);
      }
    } catch {
      toast.error(`Couldn't save the ${name.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      const res = await fetch("/api/settings/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey }),
      });
      if (res.ok) {
        toast.success(`${name} removed`);
        onSaved();
      } else {
        toast.error(`Couldn't remove the ${name.toLowerCase()}`);
      }
    } catch {
      toast.error(`Couldn't remove the ${name.toLowerCase()}`);
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  return (
    <div className="space-y-2.5">
      {configured ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="success">{source ? SOURCE_LABEL[source] : "Configured"}</StatusBadge>
          {keyInfo?.masked && <code className="font-mono text-[13px] text-muted-foreground">{keyInfo.masked}</code>}
          {removable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRemove(true)}
              className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 aria-hidden /> Remove
            </Button>
          )}
        </div>
      ) : (
        <StatusBadge tone="warning">Not set</StatusBadge>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label htmlFor={id} className="sr-only">
          {configured ? `New ${name.toLowerCase()}` : name}
        </label>
        <div className="flex-1">
          <PasswordInput
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={configured ? "Paste a new one to replace it" : placeholder}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </div>
        <Button type="submit" disabled={saving || !value.trim()}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {configured ? "Replace" : "Save"}
        </Button>
      </form>

      {helpUrl && (
        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
        >
          {helpLabel || "Where do I get this?"} <ExternalLink size={12} aria-hidden />
        </a>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${name.toLowerCase()}?`}
        description={`Features that need it will stop working until you add a new one.`}
        confirmLabel="Remove"
        variant="danger"
        loading={removing}
        onConfirm={remove}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
