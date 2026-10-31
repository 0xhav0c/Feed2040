"use client";

import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CardSkeleton, CopyField, Note, PasswordInput, SettingRow, SettingsCard, StatusBadge } from "./primitives";

export function FeverSection() {
  const uid = useId();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [username, setUsername] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [turningOff, setTurningOff] = useState(false);

  useEffect(() => {
    fetch("/api/settings/fever")
      .then((r) => r.json())
      .then((d) => {
        setEnabled(!!d.data?.enabled);
        setUsername(d.data?.username || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/fever` : "/api/fever";

  async function setFeverPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/fever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", password }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.data) {
        toast.success(enabled ? "Fever password changed — update it in your apps" : "Fever sync is on");
        setEnabled(true);
        setFreshKey(d.data.apiKey ?? null);
        setPassword("");
      } else {
        toast.error(d.error || "Couldn't set the Fever password");
      }
    } catch {
      toast.error("Couldn't set the Fever password");
    } finally {
      setSaving(false);
    }
  }

  async function turnOff() {
    setTurningOff(true);
    try {
      const res = await fetch("/api/settings/fever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable" }),
      });
      if (!res.ok) throw new Error();
      setEnabled(false);
      setFreshKey(null);
      toast.success("Fever sync turned off");
    } catch {
      toast.error("Couldn't turn off Fever sync");
    } finally {
      setTurningOff(false);
      setConfirmOff(false);
    }
  }

  if (loading) return <CardSkeleton rows={3} />;

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Sync with reader apps"
        description="Use Feed2040 from apps like Reeder, Readrops, Fluent Reader or Read You through the Fever API."
        action={<StatusBadge tone={enabled ? "success" : "neutral"}>{enabled ? "On" : "Off"}</StatusBadge>}
      >
        {enabled && (
          <>
            <SettingRow label="Server URL" description="In your app, choose Fever as the service and enter this.">
              <div className="max-w-xl">
                <CopyField value={endpoint} label="Server URL" />
              </div>
            </SettingRow>
            <SettingRow label="Username" description="Your Feed2040 username.">
              <div className="max-w-xl">
                <CopyField value={username} label="Username" mono={false} />
              </div>
            </SettingRow>
            {freshKey && (
              <SettingRow label="API key" description="Only some apps ask for it. Shown once.">
                <div className="max-w-xl">
                  <CopyField value={freshKey} label="API key" />
                </div>
              </SettingRow>
            )}
          </>
        )}
        <form onSubmit={setFeverPassword}>
          <SettingRow
            label={enabled ? "Change Fever password" : "Fever password"}
            description={
              enabled
                ? "Forgot it? Set a new one here, then update it in your apps."
                : "A separate password just for reader apps — not your login password. At least 6 characters."
            }
            htmlFor={`${uid}-pw`}
          >
            <div className="flex max-w-xl gap-2">
              <div className="flex-1">
                <PasswordInput
                  id={`${uid}-pw`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" disabled={saving || password.length < 6}>
                {saving && <Loader2 className="animate-spin" aria-hidden />}
                {enabled ? "Change" : "Turn on sync"}
              </Button>
            </div>
          </SettingRow>
        </form>
        {enabled && (
          <div className="space-y-3 py-4">
            <Note tone="warning">
              Changing your Feed2040 username disconnects reader apps. Set the Fever password again afterwards.
            </Note>
            <Button
              variant="ghost"
              onClick={() => setConfirmOff(true)}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              Turn off Fever sync
            </Button>
          </div>
        )}
      </SettingsCard>
      <ConfirmDialog
        open={confirmOff}
        title="Turn off Fever sync?"
        description="Reader apps connected through Fever will stop syncing until you set a Fever password again."
        confirmLabel="Turn off"
        variant="danger"
        loading={turningOff}
        onConfirm={turnOff}
        onCancel={() => setConfirmOff(false)}
      />
    </div>
  );
}
