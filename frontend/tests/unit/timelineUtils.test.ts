import { describe, it, expect } from "vitest";
import {
  parseDateString,
  computeAxisBounds,
  dateToPercent,
  buildTicks,
  formatTick,
  formatDuration,
  formatGapLabel,
  formatTooltipDate,
  formatTooltipDuration,
  getAdaptiveTickStrategy,
  buildAdaptiveTicks,
} from "../../components/Timeline/utils";
import type { TimelineItem } from "../../components/Timeline/types";

const item = (startDate: string, endDate?: string): TimelineItem => ({
  id: "1",
  label: "Test",
  startDate,
  endDate,
});

const DAY = 86_400_000;
const HOUR = 3_600_000;

describe("parseDateString", () => {
  it("parses a YYYY-MM-DD date", () => {
    const ms = parseDateString("2024-03-15");
    expect(ms).toBe(Date.parse("2024-03-15"));
  });

  it("parses a datetime string", () => {
    const ms = parseDateString("2024-03-15T10:30");
    expect(ms).toBe(Date.parse("2024-03-15T10:30"));
  });
});

describe("dateToPercent", () => {
  const start = 0;
  const end = 1000;

  it("maps start to 0%", () => {
    expect(dateToPercent(0, start, end)).toBe(0);
  });

  it("maps end to 100%", () => {
    expect(dateToPercent(1000, start, end)).toBe(100);
  });

  it("maps midpoint to 50%", () => {
    expect(dateToPercent(500, start, end)).toBe(50);
  });

  it("clamps below 0", () => {
    expect(dateToPercent(-100, start, end)).toBe(0);
  });

  it("clamps above 100", () => {
    expect(dateToPercent(1100, start, end)).toBe(100);
  });

  it("returns 0 when start equals end", () => {
    expect(dateToPercent(500, 500, 500)).toBe(0);
  });
});

describe("computeAxisBounds", () => {
  it("uses explicit config overrides when both are provided", () => {
    const bounds = computeAxisBounds([item("2024-06-01")], {
      axisStart: "2024-01-01",
      axisEnd: "2024-12-31",
    });
    expect(bounds.start).toBe(parseDateString("2024-01-01"));
    expect(bounds.end).toBe(parseDateString("2024-12-31"));
  });

  it("derives bounds from items with 5% padding", () => {
    const a = parseDateString("2024-01-01");
    const b = parseDateString("2024-12-31");
    const span = b - a;
    const pad = span * 0.05;
    const bounds = computeAxisBounds([item("2024-01-01"), item("2024-12-31")]);
    expect(bounds.start).toBeCloseTo(a - pad, -3);
    expect(bounds.end).toBeCloseTo(b + pad, -3);
  });

  it("uses item endDate when computing max", () => {
    const bounds = computeAxisBounds([item("2024-01-01", "2024-06-01")]);
    const endMs = parseDateString("2024-06-01");
    expect(bounds.end).toBeGreaterThan(endMs);
  });

  it("returns a fallback range when items is empty", () => {
    const { start, end } = computeAxisBounds([]);
    expect(end).toBeGreaterThan(start);
  });
});

describe("buildTicks (deprecated)", () => {
  it("returns exactly tickCount values", () => {
    const ticks = buildTicks(0, 1000, 8);
    expect(ticks).toHaveLength(8);
  });

  it("first tick equals start", () => {
    const ticks = buildTicks(100, 900, 5);
    expect(ticks[0]).toBe(100);
  });

  it("last tick equals end", () => {
    const ticks = buildTicks(100, 900, 5);
    expect(ticks[ticks.length - 1]).toBe(900);
  });

  it("returns [start] when count is 1", () => {
    expect(buildTicks(100, 900, 1)).toEqual([100]);
  });

  it("ticks are evenly spaced", () => {
    const ticks = buildTicks(0, 400, 5);
    const gaps = ticks.slice(1).map((t, i) => t - ticks[i]);
    expect(new Set(gaps).size).toBe(1);
  });
});

describe("formatTick", () => {
  it("formats a timestamp using default options", () => {
    const ms = parseDateString("2024-07-04");
    const label = formatTick(ms, "en-US");
    expect(label).toMatch(/Jul/);
  });

  it("respects custom dateFormat options", () => {
    const ms = parseDateString("2024-07-04");
    const label = formatTick(ms, "en-US", { year: "numeric" });
    expect(label).toContain("2024");
  });
});

describe("formatDuration", () => {
  it("returns minutes for durations under 1 hour", () => {
    expect(formatDuration(30 * 60_000)).toBe("30m");
  });

  it("returns hours for durations under 1 day", () => {
    expect(formatDuration(3 * HOUR)).toBe("3h");
  });

  it("returns days for durations under 7 days", () => {
    expect(formatDuration(3 * DAY)).toBe("3d");
  });

  it("returns weeks for durations 7 days or more", () => {
    expect(formatDuration(14 * DAY)).toBe("2w");
  });

  it("uses the largest unit ≥ 1", () => {
    expect(formatDuration(DAY - 1)).toBe("24h");
    expect(formatDuration(DAY)).toBe("1d");
  });
});

describe("formatGapLabel", () => {
  it("wraps duration in middle-dot separators", () => {
    const label = formatGapLabel(DAY);
    expect(label).toMatch(/·.*1d.*·/);
  });

  it("uses thin-space around the duration", () => {
    const label = formatGapLabel(2 * DAY);
    expect(label).toContain("2d");
  });
});

describe("formatTooltipDate", () => {
  it("returns Mon DD  HH:MM format", () => {
    const d = new Date("2024-03-05T08:00:00");
    const result = formatTooltipDate(d.getTime());
    expect(result).toMatch(/Mar 5\s{2}0[89]:\d{2}/);
  });

  it("always includes time component (shows 00:00 for date-only inputs)", () => {
    const d = new Date("2024-03-05");
    const result = formatTooltipDate(d.getTime());
    expect(result).toMatch(/\d{2}:\d{2}$/);
  });
});

describe("formatTooltipDuration", () => {
  it("returns 'Point event' for 0 hours", () => {
    expect(formatTooltipDuration(0)).toBe("Point event");
  });

  it("returns minutes when less than 1 hour", () => {
    expect(formatTooltipDuration(0.5)).toBe("30m");
  });

  it("returns hours when 1 or more", () => {
    expect(formatTooltipDuration(2)).toBe("2h");
    expect(formatTooltipDuration(1)).toBe("1h");
  });
});

describe("getAdaptiveTickStrategy", () => {
  const week = 7 * DAY;

  it("uses 24h interval for spans > 7 days", () => {
    const { intervalMs, includeTime } = getAdaptiveTickStrategy(8 * DAY, 2);
    expect(intervalMs).toBe(DAY);
    expect(includeTime).toBe(false);
  });

  it("uses 12h interval for 2-7 day spans at zoom < 4", () => {
    const { intervalMs, includeTime } = getAdaptiveTickStrategy(3 * DAY, 2);
    expect(intervalMs).toBe(12 * HOUR);
    expect(includeTime).toBe(false);
  });

  it("uses 3h interval for 2-7 day spans at zoom ≥ 4", () => {
    const { intervalMs, includeTime } = getAdaptiveTickStrategy(3 * DAY, 4);
    expect(intervalMs).toBe(3 * HOUR);
    expect(includeTime).toBe(true);
  });

  it("uses 1h interval for spans ≤ 12 hours", () => {
    const { intervalMs, includeTime } = getAdaptiveTickStrategy(6 * HOUR, 2);
    expect(intervalMs).toBe(HOUR);
    expect(includeTime).toBe(true);
  });

  it("uses 3h without time for ≤2 day spans at zoom < 2", () => {
    const { intervalMs, includeTime } = getAdaptiveTickStrategy(1.5 * DAY, 1);
    expect(intervalMs).toBe(3 * HOUR);
    expect(includeTime).toBe(false);
  });

  it("uses 1h with time for ≤2 day spans at zoom ≥ 2", () => {
    const { intervalMs, includeTime } = getAdaptiveTickStrategy(1.5 * DAY, 2);
    expect(intervalMs).toBe(HOUR);
    expect(includeTime).toBe(true);
  });
});

describe("buildAdaptiveTicks", () => {
  const start = Date.parse("2024-03-01T00:00:00");
  const end = Date.parse("2024-03-10T00:00:00"); // 9 days

  it("returns at most 10 ticks at zoom < 4", () => {
    const strategy = getAdaptiveTickStrategy(end - start, 2);
    const ticks = buildAdaptiveTicks(start, end, strategy, 2);
    expect(ticks.length).toBeLessThanOrEqual(10);
  });

  it("returns at most 20 ticks at zoom ≥ 4", () => {
    const strategy = getAdaptiveTickStrategy(end - start, 4);
    const ticks = buildAdaptiveTicks(start, end, strategy, 4);
    expect(ticks.length).toBeLessThanOrEqual(20);
  });

  it("returns at least 2 ticks", () => {
    const strategy = getAdaptiveTickStrategy(end - start, 2);
    const ticks = buildAdaptiveTicks(start, end, strategy, 2);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });

  it("all ticks fall within [start, end]", () => {
    const strategy = getAdaptiveTickStrategy(end - start, 2);
    const ticks = buildAdaptiveTicks(start, end, strategy, 2);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(start);
      expect(t).toBeLessThanOrEqual(end);
    }
  });
});
