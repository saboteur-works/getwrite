import { describe, it, expect } from "vitest";
import {
    parseDateString,
    computeAxisBounds,
    dateToPercent,
    buildTicks,
    formatTick,
} from "../../components/Timeline/utils";
import type { TimelineItem } from "../../components/Timeline/types";

const item = (startDate: string, endDate?: string): TimelineItem => ({
    id: "1",
    label: "Test",
    startDate,
    endDate,
});

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
        expect(bounds.end).toBeGreaterThan(endMs); // includes padding
    });

    it("returns a fallback range when items is empty", () => {
        const { start, end } = computeAxisBounds([]);
        expect(end).toBeGreaterThan(start);
    });
});

describe("buildTicks", () => {
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
