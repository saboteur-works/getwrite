import type { TimelineItem, TimelineConfig } from "./types";

/** Parse an ISO date/datetime string to a millisecond timestamp. */
export function parseDateString(s: string): number {
    return Date.parse(s);
}

/** Compute the axis start/end bounds from items, with optional config overrides. */
export function computeAxisBounds(
    items: TimelineItem[],
    config?: TimelineConfig,
): { start: number; end: number } {
    if (config?.axisStart && config?.axisEnd) {
        return {
            start: parseDateString(config.axisStart),
            end: parseDateString(config.axisEnd),
        };
    }

    if (items.length === 0) {
        const now = Date.now();
        return { start: now - 86400000 * 30, end: now };
    }

    let min = Infinity;
    let max = -Infinity;
    for (const item of items) {
        const start = parseDateString(item.startDate);
        const end = item.endDate ? parseDateString(item.endDate) : start;
        if (start < min) min = start;
        if (end > max) max = end;
    }

    const span = max - min || 86400000; // fallback: 1 day span for single-point timelines
    const pad = span * 0.05;

    return {
        start: config?.axisStart ? parseDateString(config.axisStart) : min - pad,
        end: config?.axisEnd ? parseDateString(config.axisEnd) : max + pad,
    };
}

/** Map a millisecond timestamp to a percentage position within [start, end]. Clamped to [0, 100]. */
export function dateToPercent(ms: number, start: number, end: number): number {
    if (end === start) return 0;
    const pct = ((ms - start) / (end - start)) * 100;
    return Math.max(0, Math.min(100, pct));
}

/** Build an array of evenly-spaced tick timestamps between start and end (inclusive). */
export function buildTicks(start: number, end: number, count: number): number[] {
    if (count <= 1) return [start];
    const step = (end - start) / (count - 1);
    return Array.from({ length: count }, (_, i) => start + i * step);
}

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
};

/** Format a millisecond timestamp to a human-readable tick label. */
export function formatTick(
    ms: number,
    locale?: string,
    format: Intl.DateTimeFormatOptions = DEFAULT_DATE_FORMAT,
): string {
    return new Intl.DateTimeFormat(locale, format).format(new Date(ms));
}
