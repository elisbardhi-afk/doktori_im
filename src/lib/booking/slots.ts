import { tiraneWallClockToUtc, tiraneIsoWeekday } from "./timezone";

/** A recurring weekly availability window in Tirane wall-clock time. */
export interface AvailabilityRule {
  weekday: number; // ISODOW 1=Mon..7=Sun
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  validFrom: string; // "YYYY-MM-DD" inclusive
  validUntil: string | null; // "YYYY-MM-DD" inclusive, or null = open-ended
  isActive: boolean;
}

/** A one-off change to a specific date. */
export interface AvailabilityException {
  date: string; // "YYYY-MM-DD"
  kind: "block" | "extra";
  // For `block`: null start/end = whole day off; otherwise blocks that window.
  // For `extra`: adds a bookable window on that date.
  startTime: string | null;
  endTime: string | null;
  slotDurationMinutes: number | null;
}

/** An existing appointment that occupies a range (used to exclude booked slots). */
export interface BusyRange {
  start: Date; // UTC
  end: Date; // UTC
}

export interface Slot {
  /** UTC instant the slot starts. */
  start: Date;
  /** UTC instant the slot ends. */
  end: Date;
  /** Tirane-local date "YYYY-MM-DD". */
  localDate: string;
  /** Tirane-local time "HH:mm". */
  localTime: string;
  durationMinutes: number;
}

export interface GenerateSlotsInput {
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  busy: BusyRange[];
  /** Inclusive local date range to generate over. */
  fromDate: string; // "YYYY-MM-DD"
  toDate: string; // "YYYY-MM-DD"
  /** "Now" as a UTC instant — slots at or before this are excluded. */
  now: Date;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  // Half-open [start, end): adjacent ranges do NOT overlap.
  return aStart < bEnd && bStart < aEnd;
}

/** Expand a single (date, startMin, endMin, duration) window into grid slots. */
function windowSlots(
  localDate: string,
  startMin: number,
  endMin: number,
  duration: number,
): Array<{ startMin: number; endMin: number }> {
  const out: Array<{ startMin: number; endMin: number }> = [];
  for (let s = startMin; s + duration <= endMin; s += duration) {
    out.push({ startMin: s, endMin: s + duration });
  }
  return out;
}

/**
 * Generate all bookable slots for a doctor over a local date range.
 *
 * Rules define recurring weekly windows; `extra` exceptions add windows on a
 * date; `block` exceptions remove a window (or the whole day); `busy` ranges
 * (existing appointments) and past slots are excluded. All arithmetic on the
 * grid is done in Tirane wall-clock minutes, then converted to UTC per-date so
 * DST offsets resolve correctly.
 */
export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const { rules, exceptions, busy, fromDate, toDate, now } = input;
  const slots: Slot[] = [];

  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    const wholeDayBlocked = exceptions.some(
      (e) =>
        e.date === date &&
        e.kind === "block" &&
        e.startTime === null &&
        e.endTime === null,
    );
    if (wholeDayBlocked) continue;

    const weekday = tiraneIsoWeekday(date);

    // Collect candidate windows for this date: matching active rules + extras.
    const windows: Array<{ startMin: number; endMin: number; duration: number }> =
      [];

    for (const rule of rules) {
      if (!rule.isActive) continue;
      if (rule.weekday !== weekday) continue;
      if (date < rule.validFrom) continue;
      if (rule.validUntil !== null && date > rule.validUntil) continue;
      windows.push({
        startMin: timeToMinutes(rule.startTime),
        endMin: timeToMinutes(rule.endTime),
        duration: 15,
      });
    }

    for (const exc of exceptions) {
      if (exc.date !== date) continue;
      if (exc.kind !== "extra") continue;
      if (exc.startTime === null || exc.endTime === null) continue;
      windows.push({
        startMin: timeToMinutes(exc.startTime),
        endMin: timeToMinutes(exc.endTime),
        duration: exc.slotDurationMinutes ?? 30,
      });
    }

    // Partial-block windows for this date.
    const blocks = exceptions
      .filter(
        (e) =>
          e.date === date &&
          e.kind === "block" &&
          e.startTime !== null &&
          e.endTime !== null,
      )
      .map((e) => ({
        startMin: timeToMinutes(e.startTime as string),
        endMin: timeToMinutes(e.endTime as string),
      }));

    for (const w of windows) {
      for (const g of windowSlots(date, w.startMin, w.endMin, w.duration)) {
        // Skip slots intersecting a partial block (half-open).
        const blocked = blocks.some(
          (b) => g.startMin < b.endMin && b.startMin < g.endMin,
        );
        if (blocked) continue;

        const localTime = minutesToTime(g.startMin);
        const start = tiraneWallClockToUtc(date, localTime);
        const end = tiraneWallClockToUtc(date, minutesToTime(g.endMin));

        // Exclude past slots.
        if (start <= now) continue;

        // Exclude slots overlapping an existing appointment.
        const isBusy = busy.some((b) =>
          rangesOverlap(start, end, b.start, b.end),
        );
        if (isBusy) continue;

        slots.push({
          start,
          end,
          localDate: date,
          localTime,
          durationMinutes: w.duration,
        });
      }
    }
  }

  // De-duplicate (a rule + extra could theoretically produce the same slot)
  // and sort chronologically.
  const seen = new Set<string>();
  return slots
    .filter((s) => {
      const key = s.start.toISOString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
