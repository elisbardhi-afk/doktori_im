import { describe, it, expect } from "vitest";
import {
  generateSlots,
  type AvailabilityRule,
  type AvailabilityException,
} from "./slots";

// A far-past "now" so nothing is filtered as past unless a test intends it.
const PAST_NOW = new Date("2020-01-01T00:00:00Z");

function rule(overrides: Partial<AvailabilityRule> = {}): AvailabilityRule {
  return {
    weekday: 1, // Monday
    startTime: "09:00",
    endTime: "12:00",
    validFrom: "2020-01-01",
    validUntil: null,
    isActive: true,
    ...overrides,
  };
}

describe("generateSlots — basic grid", () => {
  it("09:00–12:00 on a Monday yields 12 slots (15-min grid)", () => {
    // 2026-07-06 is a Monday.
    const slots = generateSlots({
      rules: [rule()],
      exceptions: [],
      busy: [],
      fromDate: "2026-07-06",
      toDate: "2026-07-06",
      now: PAST_NOW,
    });
    expect(slots).toHaveLength(12);
    expect(slots.map((s) => s.localTime)).toEqual([
      "09:00",
      "09:15",
      "09:30",
      "09:45",
      "10:00",
      "10:15",
      "10:30",
      "10:45",
      "11:00",
      "11:15",
      "11:30",
      "11:45",
    ]);
  });

  it("does not emit a slot that would run past endTime", () => {
    // 09:00–10:15 @15min → 09:00, 09:15, 09:30, 09:45, 10:00 (10:15 would exceed 10:15).
    const slots = generateSlots({
      rules: [rule({ endTime: "10:15" })],
      exceptions: [],
      busy: [],
      fromDate: "2026-07-06",
      toDate: "2026-07-06",
      now: PAST_NOW,
    });
    expect(slots.map((s) => s.localTime)).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00"]);
  });

  it("only generates on matching weekday", () => {
    // Rule is Monday; generate over Tue 2026-07-07 only → no slots.
    const slots = generateSlots({
      rules: [rule({ weekday: 1 })],
      exceptions: [],
      busy: [],
      fromDate: "2026-07-07",
      toDate: "2026-07-07",
      now: PAST_NOW,
    });
    expect(slots).toHaveLength(0);
  });

  it("respects validFrom / validUntil bounds", () => {
    const slots = generateSlots({
      rules: [rule({ validFrom: "2026-07-13", validUntil: "2026-07-13" })],
      exceptions: [],
      busy: [],
      fromDate: "2026-07-06", // Monday before window
      toDate: "2026-07-06",
      now: PAST_NOW,
    });
    expect(slots).toHaveLength(0);
  });
});

describe("generateSlots — DST correctness (Europe/Tirane)", () => {
  it("winter slot resolves at +01:00 UTC", () => {
    // 2026-01-19 is a Monday (winter). 09:00 local → 08:00 UTC.
    const slots = generateSlots({
      rules: [rule({ endTime: "10:00" })],
      exceptions: [],
      busy: [],
      fromDate: "2026-01-19",
      toDate: "2026-01-19",
      now: PAST_NOW,
    });
    expect(slots[0].start.toISOString()).toBe("2026-01-19T08:00:00.000Z");
  });

  it("summer slot resolves at +02:00 UTC", () => {
    // 2026-07-06 Monday (summer). 09:00 local → 07:00 UTC.
    const slots = generateSlots({
      rules: [rule({ endTime: "10:00" })],
      exceptions: [],
      busy: [],
      fromDate: "2026-07-06",
      toDate: "2026-07-06",
      now: PAST_NOW,
    });
    expect(slots[0].start.toISOString()).toBe("2026-07-06T07:00:00.000Z");
  });

  it("spring-forward day has strictly increasing UTC instants and no phantom 02:xx", () => {
    // DST 2026 starts Sun 2026-03-29: clocks jump 02:00 → 03:00 local.
    // A rule covering 00:00–06:00 that day must not emit a 02:xx local slot
    // and instants must be strictly increasing.
    const slots = generateSlots({
      rules: [
        rule({
          weekday: 7, // Sunday
          startTime: "00:00",
          endTime: "06:00",
        }),
      ],
      exceptions: [],
      busy: [],
      fromDate: "2026-03-29",
      toDate: "2026-03-29",
      now: PAST_NOW,
    });
    // No slot should have local time 02:00 (that hour does not exist).
    expect(slots.some((s) => s.localTime === "02:00")).toBe(false);
    // Strictly increasing instants.
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].start.getTime()).toBeGreaterThan(
        slots[i - 1].start.getTime(),
      );
    }
  });

  it("fall-back day yields distinct instants for the repeated hour", () => {
    // DST 2026 ends Sun 2026-10-25: clocks fall 03:00 → 02:00 local.
    const slots = generateSlots({
      rules: [
        rule({
          weekday: 7,
          startTime: "00:00",
          endTime: "06:00",
        }),
      ],
      exceptions: [],
      busy: [],
      fromDate: "2026-10-25",
      toDate: "2026-10-25",
      now: PAST_NOW,
    });
    // All emitted instants are unique.
    const iso = slots.map((s) => s.start.toISOString());
    expect(new Set(iso).size).toBe(iso.length);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].start.getTime()).toBeGreaterThan(
        slots[i - 1].start.getTime(),
      );
    }
  });
});

describe("generateSlots — busy exclusion", () => {
  it("a confirmed appointment removes its slot", () => {
    // Busy 09:30–10:00 (summer → 07:30–08:00 UTC) removes the 09:30 and 09:45 slots.
    const slots = generateSlots({
      rules: [rule()],
      exceptions: [],
      busy: [
        {
          start: new Date("2026-07-06T07:30:00Z"),
          end: new Date("2026-07-06T08:00:00Z"),
        },
      ],
      fromDate: "2026-07-06",
      toDate: "2026-07-06",
      now: PAST_NOW,
    });
    expect(slots.map((s) => s.localTime)).toEqual([
      "09:00",
      "09:15",
      "10:00",
      "10:15",
      "10:30",
      "10:45",
      "11:00",
      "11:15",
      "11:30",
      "11:45",
    ]);
  });

  it("a 60-min appointment suppresses four adjacent 15-min slots", () => {
    // Busy 10:00–11:00 local (summer → 08:00–09:00 UTC) removes 10:00, 10:15, 10:30, 10:45.
    const slots = generateSlots({
      rules: [rule()],
      exceptions: [],
      busy: [
        {
          start: new Date("2026-07-06T08:00:00Z"),
          end: new Date("2026-07-06T09:00:00Z"),
        },
      ],
      fromDate: "2026-07-06",
      toDate: "2026-07-06",
      now: PAST_NOW,
    });
    expect(slots.map((s) => s.localTime)).toEqual([
      "09:00",
      "09:15",
      "09:30",
      "09:45",
      "11:00",
      "11:15",
      "11:30",
      "11:45",
    ]);
  });

  it("adjacent (non-overlapping) busy range does not remove a slot", () => {
    // Busy 09:30–10:00 is adjacent to the 09:00–09:30 slot; 09:00 stays.
    const slots = generateSlots({
      rules: [rule()],
      exceptions: [],
      busy: [
        {
          start: new Date("2026-07-06T07:30:00Z"),
          end: new Date("2026-07-06T08:00:00Z"),
        },
      ],
      fromDate: "2026-07-06",
      toDate: "2026-07-06",
      now: PAST_NOW,
    });
    expect(slots.some((s) => s.localTime === "09:00")).toBe(true);
  });
});

describe("generateSlots — exceptions", () => {
  it("whole-day block removes all slots", () => {
    const exc: AvailabilityException = {
      date: "2026-07-06",
      kind: "block",
      startTime: null,
      endTime: null,
      slotDurationMinutes: null,
    };
    const slots = generateSlots({
      rules: [rule()],
      exceptions: [exc],
      busy: [],
      fromDate: "2026-07-06",
      toDate: "2026-07-06",
      now: PAST_NOW,
    });
    expect(slots).toHaveLength(0);
  });

  it("partial block removes only overlapping slots", () => {
    const exc: AvailabilityException = {
      date: "2026-07-06",
      kind: "block",
      startTime: "10:00",
      endTime: "11:00",
      slotDurationMinutes: null,
    };
    const slots = generateSlots({
      rules: [rule()],
      exceptions: [exc],
      busy: [],
      fromDate: "2026-07-06",
      toDate: "2026-07-06",
      now: PAST_NOW,
    });
    expect(slots.map((s) => s.localTime)).toEqual([
      "09:00",
      "09:15",
      "09:30",
      "09:45",
      "11:00",
      "11:15",
      "11:30",
      "11:45",
    ]);
  });

  it("extra exception adds slots on a non-rule weekday", () => {
    // Tuesday 2026-07-07 has no rule; an extra window adds slots.
    // Extra windows default to 30-minute slots (from line 141 in slots.ts).
    const exc: AvailabilityException = {
      date: "2026-07-07",
      kind: "extra",
      startTime: "14:00",
      endTime: "15:00",
      slotDurationMinutes: 30,
    };
    const slots = generateSlots({
      rules: [rule({ weekday: 1 })],
      exceptions: [exc],
      busy: [],
      fromDate: "2026-07-07",
      toDate: "2026-07-07",
      now: PAST_NOW,
    });
    expect(slots.map((s) => s.localTime)).toEqual(["14:00", "14:30"]);
  });
});

describe("generateSlots — past filtering", () => {
  it("excludes slots at or before now", () => {
    // now = 2026-07-06 10:00 local = 08:00 UTC. Slots 09:00–10:00 are at/before now;
    // 10:15, 10:30, 10:45, 11:00, 11:15, 11:30, 11:45 remain.
    const slots = generateSlots({
      rules: [rule()],
      exceptions: [],
      busy: [],
      fromDate: "2026-07-06",
      toDate: "2026-07-06",
      now: new Date("2026-07-06T08:00:00Z"),
    });
    expect(slots.map((s) => s.localTime)).toEqual(["10:15", "10:30", "10:45", "11:00", "11:15", "11:30", "11:45"]);
  });
});
