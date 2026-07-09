import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * All appointment instants are stored/compared in UTC. Doctors express their
 * availability in Albanian wall-clock time. Albania observes Central European
 * Time (CET, UTC+1) in winter and Central European Summer Time (CEST, UTC+2)
 * in summer, so the UTC offset of a given wall-clock time depends on the date.
 */
export const TIRANE_TZ = "Europe/Tirane";

/**
 * Convert an Albanian wall-clock date + "HH:mm" time into the corresponding
 * UTC instant, resolving the correct DST offset for that specific calendar day.
 *
 * @param localDate "YYYY-MM-DD" in Tirane local time
 * @param time      "HH:mm" (24h) in Tirane local time
 */
export function tiraneWallClockToUtc(localDate: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  // Interpret "localDate HH:mm:00" as a Tirane wall-clock time → UTC instant.
  return fromZonedTime(`${localDate}T${hh}:${mm}:00`, TIRANE_TZ);
}

/** The Tirane-local calendar date ("YYYY-MM-DD") for a UTC instant. */
export function utcToTiraneDate(instant: Date): string {
  const zoned = toZonedTime(instant, TIRANE_TZ);
  const y = zoned.getFullYear();
  const mo = String(zoned.getMonth() + 1).padStart(2, "0");
  const d = String(zoned.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** The Tirane-local "HH:mm" for a UTC instant. */
export function utcToTiraneTime(instant: Date): string {
  const zoned = toZonedTime(instant, TIRANE_TZ);
  const hh = String(zoned.getHours()).padStart(2, "0");
  const mm = String(zoned.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** ISODOW weekday for a Tirane-local date: Monday = 1 … Sunday = 7. */
export function tiraneIsoWeekday(localDate: string): number {
  // Noon avoids any DST edge landing on midnight.
  const instant = tiraneWallClockToUtc(localDate, "12:00");
  const zoned = toZonedTime(instant, TIRANE_TZ);
  const jsDay = zoned.getDay(); // 0 = Sunday … 6 = Saturday
  return jsDay === 0 ? 7 : jsDay;
}
