import { formatInTimeZone } from "date-fns-tz";
import type { Locale } from "date-fns";
import { enUS } from "date-fns/locale";

const TIRANE = "Europe/Tirane";

/** Format a UTC instant in Tirane local time. */
export function formatInTirane(
  instant: Date | string,
  pattern = "d MMM yyyy, HH:mm",
  locale: Locale = enUS,
): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return formatInTimeZone(date, TIRANE, pattern, { locale });
}

/** Tirane-local "HH:mm" for a UTC instant. */
export function timeInTirane(instant: Date | string): string {
  return formatInTirane(instant, "HH:mm");
}

/** Tirane-local ISO date "yyyy-MM-dd" for a UTC instant. */
export function dateInTirane(instant: Date | string): string {
  return formatInTirane(instant, "yyyy-MM-dd");
}
