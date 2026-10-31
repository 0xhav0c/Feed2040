"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  browserTimeZone,
  CardSkeleton,
  Note,
  SaveBar,
  Select,
  SettingRow,
  SettingsCard,
  StatusBadge,
  TimeListEditor,
  timeZones,
  ToggleChip,
} from "./primitives";

const RANGE_OPTIONS = [
  { value: 12, label: "Last 12 hours" },
  { value: 24, label: "Last 24 hours" },
  { value: 48, label: "Last 2 days" },
  { value: 72, label: "Last 3 days" },
  { value: 168, label: "Last 7 days" },
];

type Briefing = {
  briefingEnabled: boolean;
  briefingTimes: string[];
  briefingTimezone: string;
  briefingHours: number;
  briefingCategories: string[];
};

const same = (a: Briefing, b: Briefing) =>
  a.briefingEnabled === b.briefingEnabled &&
  a.briefingTimezone === b.briefingTimezone &&
  a.briefingHours === b.briefingHours &&
  [...a.briefingTimes].sort().join() === [...b.briefingTimes].sort().join() &&
  [...a.briefingCategories].sort().join() === [...b.briefingCategories].sort().join();

export function BriefingSection({ active, onNavigate }: { active: boolean; onNavigate: (section: string) => void }) {
  return (
    <div className="space-y-6">
      <ScheduleCard />
      <TelegramDeliveryCard active={active} onNavigate={onNavigate} />
    </div>
  );
}

function ScheduleCard() {
  const uid = useId();
  const [saved, setSaved] = useState<Briefing | null>(null);
  const [draft, setDraft] = useState<Briefing | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [aiRes, catRes] = await Promise.all([fetch("/api/settings/ai"), fetch("/api/categories")]);
        const ai = await aiRes.json();
        const cats = await catRes.json();
        const b: Briefing = {
          briefingEnabled: ai.data?.briefingEnabled ?? false,
          briefingTimes: ai.data?.briefingTimes ?? [],
          briefingTimezone: ai.data?.briefingTimezone || browserTimeZone(),
          briefingHours: ai.data?.briefingHours ?? 24,
          briefingCategories: ai.data?.briefingCategories ?? [],
        };
        setSaved(b);
        setDraft(b);
        const flat: { id: string; name: string }[] = [];
        const walk = (c: { id: string; name: string; children?: unknown[] }) => {
          flat.push({ id: c.id, name: c.name });
          if (Array.isArray(c.children)) c.children.forEach((ch) => walk(ch as typeof c));
        };
        (Array.isArray(cats.data) ? cats.data : []).forEach(walk);
        setCategories(flat);
      } catch {
        const b: Briefing = {
          briefingEnabled: false,
          briefingTimes: [],
          briefingTimezone: browserTimeZone(),
          briefingHours: 24,
          briefingCategories: [],
        };
        setSaved(b);
        setDraft(b);
      }
    })();
  }, []);

  const zones = useMemo(() => timeZones(draft?.briefingTimezone), [draft?.briefingTimezone]);

  if (!saved || !draft) return <CardSkeleton rows={4} />;

  const dirty = !same(saved, draft);
  const missingTimes = draft.briefingEnabled && draft.briefingTimes.length === 0;
  const allCats = draft.briefingCategories.length === 0;

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaved(draft);
        toast.success(draft.briefingEnabled ? "Briefing schedule saved" : "Automatic briefings turned off");
      } else {
        toast.error(d.error || "Couldn't save the schedule");
      }
    } catch {
      toast.error("Couldn't save the schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Automatic briefing"
      description="Feed2040 writes a briefing from your new articles at the times you choose. You can always generate one by hand on the Briefing page."
      action={<StatusBadge tone={saved.briefingEnabled ? "success" : "neutral"}>{saved.briefingEnabled ? "On" : "Off"}</StatusBadge>}
      footer={
        <SaveBar
          dirty={dirty}
          saving={saving}
          disabled={missingTimes}
          onSave={save}
          onDiscard={() => setDraft(saved)}
        />
      }
    >
      <SettingRow label="Generate automatically" htmlFor={`${uid}-on`}>
        <Switch
          id={`${uid}-on`}
          checked={draft.briefingEnabled}
          onCheckedChange={(v: boolean) => setDraft({ ...draft, briefingEnabled: v })}
        />
      </SettingRow>
      {draft.briefingEnabled && (
        <>
          <SettingRow label="At" description="One briefing at each of these times.">
            <TimeListEditor
              idPrefix={`${uid}-times`}
              value={draft.briefingTimes}
              onChange={(t) => setDraft({ ...draft, briefingTimes: t })}
              emptyText="Add at least one time"
            />
            {missingTimes && (
              <p className="mt-2 text-[13px] text-amber-700 dark:text-amber-400">Add a time to save the schedule.</p>
            )}
          </SettingRow>
          <SettingRow label="Time zone" htmlFor={`${uid}-tz`}>
            <Select
              id={`${uid}-tz`}
              value={draft.briefingTimezone}
              onChange={(e) => setDraft({ ...draft, briefingTimezone: e.target.value })}
              className="max-w-sm"
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </SettingRow>
          <SettingRow label="Cover" description="Which articles each briefing reads." htmlFor={`${uid}-range`}>
            <Select
              id={`${uid}-range`}
              value={draft.briefingHours}
              onChange={(e) => setDraft({ ...draft, briefingHours: Number(e.target.value) })}
              className="max-w-sm"
            >
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </SettingRow>
          {categories.length > 0 && (
            <SettingRow label="Categories" description="Pick some to focus the briefing, or keep all." stacked>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Briefing categories">
                <ToggleChip pressed={allCats} onClick={() => setDraft({ ...draft, briefingCategories: [] })}>
                  All categories
                </ToggleChip>
                {categories.map((c) => {
                  const on = draft.briefingCategories.includes(c.id);
                  return (
                    <ToggleChip
                      key={c.id}
                      pressed={on}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          briefingCategories: on
                            ? draft.briefingCategories.filter((x) => x !== c.id)
                            : [...draft.briefingCategories, c.id],
                        })
                      }
                    >
                      {c.name}
                    </ToggleChip>
                  );
                })}
              </div>
            </SettingRow>
          )}
        </>
      )}
    </SettingsCard>
  );
}

type TelegramState = { connected: boolean; times: string[]; timezone: string };

function TelegramDeliveryCard({ active, onNavigate }: { active: boolean; onNavigate: (s: string) => void }) {
  const uid = useId();
  const [saved, setSaved] = useState<TelegramState | null>(null);
  const [draft, setDraft] = useState<TelegramState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/telegram");
      const d = await res.json();
      const s: TelegramState = {
        connected: !!(res.ok && d.data?.isActive),
        times: d.data?.scheduleTimes ?? [],
        timezone: d.data?.timezone || browserTimeZone(),
      };
      setSaved(s);
      setDraft(s);
    } catch {
      const s = { connected: false, times: [], timezone: browserTimeZone() };
      setSaved(s);
      setDraft(s);
    }
  }, []);

  // Re-check when the section is shown: the account may have been linked
  // under Notifications in the meantime.
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const zones = useMemo(() => timeZones(draft?.timezone), [draft?.timezone]);

  if (!saved || !draft) return <CardSkeleton rows={2} />;

  const dirty = saved.timezone !== draft.timezone || [...saved.times].sort().join() !== [...draft.times].sort().join();

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleTimes: draft.times, timezone: draft.timezone }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        const next = { ...draft, times: d.data?.scheduleTimes ?? draft.times };
        setSaved(next);
        setDraft(next);
        toast.success(draft.times.length ? "Telegram delivery saved" : "Telegram delivery turned off");
      } else {
        toast.error(d.error || "Couldn't save delivery times");
      }
    } catch {
      toast.error("Couldn't save delivery times");
    } finally {
      setSaving(false);
    }
  }

  if (!saved.connected) {
    return (
      <SettingsCard
        title="Send to Telegram"
        description="Get today's briefing as a Telegram message."
        action={<StatusBadge tone="neutral">Not connected</StatusBadge>}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-[13px] text-muted-foreground">Connect your Telegram account first.</p>
          <Button variant="outline" onClick={() => onNavigate("notifications")}>
            Set up Telegram <ArrowRight aria-hidden />
          </Button>
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title="Send to Telegram"
      description="Today's briefing is sent to your Telegram at these times. Remove all times to stop."
      action={
        <StatusBadge tone={saved.times.length ? "success" : "neutral"}>
          {saved.times.length ? `${saved.times.length}× a day` : "Off"}
        </StatusBadge>
      }
      footer={<SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setDraft(saved)} />}
    >
      <SettingRow label="Send at">
        <TimeListEditor
          idPrefix={`${uid}-tg`}
          value={draft.times}
          onChange={(t) => setDraft({ ...draft, times: t })}
          emptyText="No delivery times — nothing is sent"
        />
      </SettingRow>
      <SettingRow label="Time zone" htmlFor={`${uid}-tgtz`}>
        <Select
          id={`${uid}-tgtz`}
          value={draft.timezone}
          onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
          className="max-w-sm"
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </SettingRow>
      {draft.times.length > 0 && (
        <div className="py-4">
          <Note tone="info">Each message uses the newest briefing made since the previous send, or writes a fresh one if there is none.</Note>
        </div>
      )}
    </SettingsCard>
  );
}
