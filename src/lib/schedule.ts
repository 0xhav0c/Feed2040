import { dateKeyInTz, minutesOfDayInTz, parseSlot, zonedTimeToUtc } from "@/lib/timezone";

export interface DueSlot {
  /** "HH:MM" */
  slot: string;
  /** UTC instant the slot fell due today. */
  at: Date;
  /** Unique per local day + slot, e.g. "2026-10-31 09:00". */
  key: string;
}

/**
 * The most recent of `times` ("HH:MM", local to `tz`) that has already come
 * due today, or null when none has yet. Earlier slots of the same day are
 * superseded by later ones, so a late run catches up exactly once.
 */
export function latestDueSlot(times: string[], tz: string, now: Date = new Date()): DueSlot | null {
  const nowMin = minutesOfDayInTz(tz, now);
  let best: number | null = null;
  for (const t of times) {
    const m = parseSlot(t);
    if (m !== null && m <= nowMin && (best === null || m > best)) best = m;
  }
  if (best === null) return null;
  const h = Math.floor(best / 60);
  const min = best % 60;
  const slot = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  return { slot, at: zonedTimeToUtc(tz, now, h, min), key: `${dateKeyInTz(tz, now)} ${slot}` };
}

// Failed slot attempts, kept in memory so a broken AI provider is retried a
// few times with spacing instead of on every one-minute cron tick.
const attempts = new Map<string, { count: number; last: number }>();
const RETRY_AFTER_MS = 30 * 60_000;
const MAX_ATTEMPTS = 3;

export function shouldAttempt(key: string, now = Date.now()): boolean {
  const a = attempts.get(key);
  if (!a) return true;
  return a.count < MAX_ATTEMPTS && now - a.last >= RETRY_AFTER_MS;
}

/** Record a failed attempt; `giveUp` stops further retries for this slot. */
export function recordFailedAttempt(key: string, giveUp = false, now = Date.now()): void {
  const prev = attempts.get(key);
  attempts.set(key, { count: giveUp ? MAX_ATTEMPTS : (prev?.count ?? 0) + 1, last: now });
  // Slot keys are per day; forget anything older than two days.
  for (const [k, v] of attempts) {
    if (now - v.last > 2 * 86_400_000) attempts.delete(k);
  }
}
