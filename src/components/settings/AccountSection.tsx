"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardSkeleton, LANGUAGES, PasswordInput, SaveBar, Select, SettingRow, SettingsCard } from "./primitives";

type Profile = { name: string; username: string };

export function AccountSection() {
  return (
    <div className="space-y-6">
      <ProfileCard />
      <PasswordCard />
      <ReadingCard />
    </div>
  );
}

function ProfileCard() {
  const [saved, setSaved] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Profile>({ name: "", username: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/profile")
      .then((r) => r.json())
      .then((d) => {
        const p = { name: d.data?.name || "", username: d.data?.username || "" };
        setSaved(p);
        setDraft(p);
      })
      .catch(() => setSaved({ name: "", username: "" }));
  }, []);

  if (!saved) return <CardSkeleton rows={2} />;

  const dirty = draft.name !== saved.name || draft.username !== saved.username;
  const u = draft.username.trim();
  const usernameError =
    u.length < 3 || u.length > 30
      ? "3–30 characters"
      : !/^[a-zA-Z0-9_]+$/.test(u)
        ? "Only letters, numbers and _"
        : null;
  // The API rejects an empty name, so only require one if it was set before.
  const nameError = saved.name !== "" && draft.name.trim() === "" ? "Can't be empty" : null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: draft.username.trim(),
          ...(draft.name.trim() && { name: draft.name.trim() }),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaved({ name: draft.name.trim(), username: draft.username.trim() });
        toast.success("Profile saved");
      } else {
        toast.error(d.error || "Couldn't save your profile");
      }
    } catch {
      toast.error("Couldn't save your profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Profile"
      description="How you sign in and how your name appears."
      footer={
        <SaveBar dirty={dirty} saving={saving} disabled={!!usernameError || !!nameError} onSave={save} onDiscard={() => setDraft(saved)} />
      }
    >
      <SettingRow label="Username" description="Used to sign in. Letters, numbers and _ only." htmlFor="acc-username">
        <Input
          id="acc-username"
          value={draft.username}
          onChange={(e) => setDraft({ ...draft, username: e.target.value })}
          autoComplete="username"
          aria-invalid={!!usernameError}
          aria-describedby={usernameError ? "acc-username-err" : undefined}
          className="max-w-sm"
        />
        {usernameError && (
          <p id="acc-username-err" className="mt-1.5 text-[13px] text-destructive">
            {usernameError}
          </p>
        )}
      </SettingRow>
      <SettingRow label="Display name" description="Shown in the sidebar and on your briefings." htmlFor="acc-name">
        <Input
          id="acc-name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          autoComplete="name"
          aria-invalid={!!nameError}
          aria-describedby={nameError ? "acc-name-err" : undefined}
          className="max-w-sm"
        />
        {nameError && (
          <p id="acc-name-err" className="mt-1.5 text-[13px] text-destructive">
            {nameError}
          </p>
        )}
      </SettingRow>
    </SettingsCard>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const tooShort = next.length > 0 && next.length < 6;
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = current.length > 0 && next.length >= 6 && next === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Password changed");
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        toast.error(d.error || "Couldn't change your password");
      }
    } catch {
      toast.error("Couldn't change your password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <SettingsCard
        title="Password"
        description="Your Feed2040 login password. Reader apps use a separate Fever password."
        footer={
          <div className="flex justify-end border-t border-border bg-muted/30 px-5 py-3 rounded-b-xl">
            <Button type="submit" disabled={!ready || saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Change password
            </Button>
          </div>
        }
      >
        {/* hidden username helps password managers pair the new password with the account */}
        <input type="text" autoComplete="username" className="hidden" tabIndex={-1} aria-hidden readOnly />
        <SettingRow label="Current password" htmlFor="pw-current">
          <PasswordInput
            id="pw-current"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className="max-w-sm"
          />
        </SettingRow>
        <SettingRow label="New password" description="At least 6 characters." htmlFor="pw-new">
          <div className="max-w-sm">
            <PasswordInput
              id="pw-new"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              aria-invalid={tooShort}
              aria-describedby={tooShort ? "pw-new-err" : undefined}
            />
          </div>
          {tooShort && (
            <p id="pw-new-err" className="mt-1.5 text-[13px] text-destructive">
              {6 - next.length} more character{6 - next.length === 1 ? "" : "s"} needed
            </p>
          )}
        </SettingRow>
        <SettingRow label="Confirm new password" htmlFor="pw-confirm">
          <div className="max-w-sm">
            <PasswordInput
              id="pw-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              aria-invalid={mismatch}
              aria-describedby={mismatch ? "pw-confirm-err" : undefined}
            />
          </div>
          {mismatch && (
            <p id="pw-confirm-err" className="mt-1.5 text-[13px] text-destructive">
              Doesn&apos;t match the new password
            </p>
          )}
        </SettingRow>
      </SettingsCard>
    </form>
  );
}

const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

function ReadingCard() {
  // localStorage is per browser; read it without a server/client mismatch.
  const stored = useSyncExternalStore(
    subscribeStorage,
    () => localStorage.getItem("translateLanguage"),
    () => null
  );
  const [picked, setPicked] = useState<string | null>(null);
  const lang = picked ?? stored ?? "tr";

  return (
    <SettingsCard title="Reading" description="Preferences for this browser. Saved as soon as you change them.">
      <SettingRow
        label="Translate articles to"
        description="Target language for the Translate button in the reader."
        htmlFor="read-lang"
      >
        <Select
          id="read-lang"
          value={lang}
          onChange={(e) => {
            setPicked(e.target.value);
            localStorage.setItem("translateLanguage", e.target.value);
            toast.success("Translation language saved");
          }}
          className="max-w-sm"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
      </SettingRow>
    </SettingsCard>
  );
}
