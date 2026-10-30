// Timezone helpers. The server runs in UTC (Docker), but "today", briefing
// dates and schedule slots are all meant in the user's local time.

export const DEFAULT_TIMEZONE = "Europe/Istanbul";

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimezone(tz: unknown, fallback = DEFAULT_TIMEZONE): string {
  return isValidTimezone(tz) ? tz : fallback;
}

function zonedParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of `tz` from UTC at `date`, in milliseconds. */
function tzOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** YYYY-MM-DD of `date` as seen in `tz`. */
export function dateKeyInTz(tz: string, date: Date = new Date()): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Minutes since local midnight of `date` in `tz`. */
export function minutesOfDayInTz(tz: string, date: Date = new Date()): number {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute;
}

/** UTC instant of the local wall-clock time `hh:mm` on the local day containing `date`. */
export function zonedTimeToUtc(tz: string, date: Date, hour: number, minute: number): Date {
  const p = zonedParts(date, tz);
  const guess = Date.UTC(p.year, p.month - 1, p.day, hour, minute, 0);
  // Two passes settle DST transitions where the offset differs on either side.
  let result = guess - tzOffsetMs(new Date(guess), tz);
  result = guess - tzOffsetMs(new Date(result), tz);
  return new Date(result);
}

/** [start, end) of the local day containing `date` in `tz`, as UTC instants. */
export function dayRangeInTz(tz: string, date: Date = new Date()): { start: Date; end: Date } {
  const start = zonedTimeToUtc(tz, date, 0, 0);
  // Step into the next local day (25h covers DST days) and take its midnight.
  const end = zonedTimeToUtc(tz, new Date(start.getTime() + 25 * 3600_000), 0, 0);
  return { start, end };
}

/** Parse "HH:MM" into minutes since midnight, or null when malformed. */
export function parseSlot(slot: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(slot.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
