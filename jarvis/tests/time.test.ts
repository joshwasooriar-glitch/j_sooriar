import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  lastNLocalDays,
  localDateString,
  startOfLocalDay,
  timeZoneOffsetMinutes,
} from "../lib/engine/time";

const TZ = "America/New_York";

describe("localDateString", () => {
  it("returns the local calendar date, not the UTC one", () => {
    // 11:30pm ET Oct 14 == 03:30 UTC Oct 15.
    expect(localDateString(new Date("2026-10-15T03:30:00Z"), TZ)).toBe("2026-10-14");
  });

  it("handles midday unambiguously", () => {
    expect(localDateString(new Date("2026-10-15T16:00:00Z"), TZ)).toBe("2026-10-15");
  });

  it("handles UTC", () => {
    expect(localDateString(new Date("2026-10-15T03:30:00Z"), "UTC")).toBe("2026-10-15");
  });
});

describe("timeZoneOffsetMinutes", () => {
  it("reports EDT in October", () => {
    expect(timeZoneOffsetMinutes(new Date("2026-10-15T16:00:00Z"), TZ)).toBe(-240);
  });

  it("reports EST in December, after the DST change", () => {
    expect(timeZoneOffsetMinutes(new Date("2026-12-15T16:00:00Z"), TZ)).toBe(-300);
  });
});

describe("daysBetween", () => {
  it("counts forward", () => {
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
  });

  it("counts backward as negative", () => {
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
  });

  it("returns zero for the same day", () => {
    expect(daysBetween("2026-10-15", "2026-10-15")).toBe(0);
  });

  it("is unaffected by the DST transition", () => {
    // Nov 1 2026 is the fall-back date. A naive 24-hour divide gives 30.04 here.
    expect(daysBetween("2026-10-20", "2026-11-19")).toBe(30);
  });

  it("crosses a year boundary", () => {
    expect(daysBetween("2026-12-20", "2027-01-05")).toBe(16);
  });
});

describe("addDays", () => {
  it("adds and subtracts", () => {
    expect(addDays("2026-10-15", 5)).toBe("2026-10-20");
    expect(addDays("2026-10-15", -20)).toBe("2026-09-25");
  });

  it("rolls over a month boundary", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("startOfLocalDay", () => {
  it("returns the instant of local midnight", () => {
    const start = startOfLocalDay(new Date("2026-10-15T16:00:00Z"), TZ);
    // Midnight ET on Oct 15 is 04:00 UTC.
    expect(start.toISOString()).toBe("2026-10-15T04:00:00.000Z");
  });

  it("uses the correct offset in winter", () => {
    const start = startOfLocalDay(new Date("2026-12-15T16:00:00Z"), TZ);
    expect(start.toISOString()).toBe("2026-12-15T05:00:00.000Z");
  });
});

describe("lastNLocalDays", () => {
  it("returns n days ending today, oldest first", () => {
    const days = lastNLocalDays(new Date("2026-10-15T16:00:00Z"), TZ, 3);
    expect(days).toEqual(["2026-10-13", "2026-10-14", "2026-10-15"]);
  });

  it("returns exactly n entries", () => {
    expect(lastNLocalDays(new Date("2026-10-15T16:00:00Z"), TZ, 30)).toHaveLength(30);
  });
});
