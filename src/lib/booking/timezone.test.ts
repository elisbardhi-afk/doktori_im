import { describe, it, expect } from "vitest";
import {
  tiraneWallClockToUtc,
  utcToTiraneDate,
  utcToTiraneTime,
  tiraneIsoWeekday,
} from "./timezone";

describe("tiraneWallClockToUtc — DST-aware offset", () => {
  it("uses +01:00 (CET) in winter", () => {
    // 2026-01-15 09:00 Tirane (winter) → 08:00 UTC
    const utc = tiraneWallClockToUtc("2026-01-15", "09:00");
    expect(utc.toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("uses +02:00 (CEST) in summer", () => {
    // 2026-07-15 09:00 Tirane (summer) → 07:00 UTC
    const utc = tiraneWallClockToUtc("2026-07-15", "09:00");
    expect(utc.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("round-trips back to the same wall clock", () => {
    const utc = tiraneWallClockToUtc("2026-03-10", "14:30");
    expect(utcToTiraneDate(utc)).toBe("2026-03-10");
    expect(utcToTiraneTime(utc)).toBe("14:30");
  });
});

describe("tiraneIsoWeekday — Monday=1..Sunday=7", () => {
  it("maps a known Monday to 1", () => {
    // 2026-07-06 is a Monday
    expect(tiraneIsoWeekday("2026-07-06")).toBe(1);
  });

  it("maps a known Sunday to 7", () => {
    // 2026-07-12 is a Sunday
    expect(tiraneIsoWeekday("2026-07-12")).toBe(7);
  });

  it("maps a known Saturday to 6", () => {
    // 2026-07-11 is a Saturday
    expect(tiraneIsoWeekday("2026-07-11")).toBe(6);
  });
});
