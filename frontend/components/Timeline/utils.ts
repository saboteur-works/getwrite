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

  const span = max - min || 86400000;
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

/** @deprecated Use buildAdaptiveTicks instead. */
export function buildTicks(
  start: number,
  end: number,
  count: number,
): number[] {
  if (count <= 1) return [start];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => start + i * step);
}

// ── Adaptive tick strategy ──────────────────────────────────────────────────

export interface TickStrategy {
  intervalMs: number;
  format: Intl.DateTimeFormatOptions;
  includeTime: boolean;
}

const MS = { hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000 };

/**
 * Choose tick interval and label format based on story span and zoom level.
 * Implements the 6-row table from STYLE.md §7.
 */
export function getAdaptiveTickStrategy(
  spanMs: number,
  zoom: number,
): TickStrategy {
  const dateOnly: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  const dateTime: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };

  if (spanMs > 7 * MS.day) {
    return { intervalMs: MS.day, format: dateOnly, includeTime: false };
  }
  if (spanMs > 2 * MS.day) {
    if (zoom < 4) {
      return { intervalMs: 12 * MS.hour, format: dateOnly, includeTime: false };
    }
    return { intervalMs: 3 * MS.hour, format: dateTime, includeTime: true };
  }
  if (spanMs <= 12 * MS.hour) {
    return { intervalMs: MS.hour, format: dateTime, includeTime: true };
  }
  // ≤ 2 days
  if (zoom < 2) {
    return { intervalMs: 3 * MS.hour, format: dateOnly, includeTime: false };
  }
  return { intervalMs: MS.hour, format: dateTime, includeTime: true };
}

/** Snap a timestamp forward to the next clean calendar boundary for a given interval. */
function snapToBoundary(ms: number, intervalMs: number): number {
  const d = new Date(ms);
  if (intervalMs >= MS.day) {
    // Snap to next midnight
    d.setHours(0, 0, 0, 0);
    d.setTime(d.getTime() + MS.day);
  } else if (intervalMs >= 12 * MS.hour) {
    // Snap to next noon or midnight
    d.setMinutes(0, 0, 0);
    const h = d.getHours();
    if (h < 12) {
      d.setHours(12);
    } else {
      d.setHours(0);
      d.setTime(d.getTime() + MS.day);
    }
  } else if (intervalMs >= 3 * MS.hour) {
    // Snap to next 3-hour boundary
    d.setMinutes(0, 0, 0);
    const h = d.getHours();
    const next = Math.ceil((h + 0.01) / 3) * 3;
    if (next >= 24) {
      d.setHours(0, 0, 0, 0);
      d.setTime(d.getTime() + MS.day);
    } else {
      d.setHours(next);
    }
  } else {
    // Snap to next hour
    d.setMinutes(0, 0, 0);
    d.setTime(d.getTime() + MS.hour);
  }
  return d.getTime();
}

/**
 * Build calendar-aligned tick timestamps.
 * Thins to max 20 ticks at zoom ≥ 4×, max 10 at zoom < 4×.
 */
export function buildAdaptiveTicks(
  start: number,
  end: number,
  strategy: TickStrategy,
  zoom: number,
): number[] {
  const maxTicks = zoom >= 4 ? 20 : 10;
  const first = snapToBoundary(start, strategy.intervalMs);
  const ticks: number[] = [];

  let t = first;
  while (t <= end) {
    ticks.push(t);
    t += strategy.intervalMs;
  }

  if (ticks.length === 0) {
    // Fallback: evenly space 2 ticks across the span
    return [start, end];
  }

  if (ticks.length <= maxTicks) return ticks;

  // Thin evenly
  const step = (ticks.length - 1) / (maxTicks - 1);
  return Array.from(
    { length: maxTicks },
    (_, i) => ticks[Math.round(i * step)],
  );
}

// ── Formatting ──────────────────────────────────────────────────────────────

/**
 * Format a duration as the largest unit ≥ 1.
 * Units: w (weeks), d (days), h (hours), m (minutes).
 */
export function formatDuration(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = ms / MS.hour;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = ms / MS.day;
  if (days < 7) return `${Math.round(days)}d`;
  return `${Math.round(days / 7)}w`;
}

/** Format a gap as "· Nd ·" (middle-dot + thin-space + duration + thin-space + middle-dot). */
export function formatGapLabel(ms: number): string {
  return `· ${formatDuration(ms)} ·`;
}

/**
 * Format a millisecond timestamp as "Mon DD  HH:MM" for the tooltip.
 * Always includes time (shows 00:00 when no time component).
 */
export function formatTooltipDate(ms: number): string {
  const d = new Date(ms);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${month} ${day}  ${h}:${m}`;
}

/**
 * Format a duration in hours for the tooltip duration field.
 * 0 → "Point event", <1h → "Nm", ≥1h → "Nh"
 */
export function formatTooltipDuration(durationH: number): string {
  if (durationH === 0) return "Point event";
  if (durationH < 1) return `${Math.round(durationH * 60)}m`;
  return `${Math.round(durationH)}h`;
}

// ── Tick label formatting ───────────────────────────────────────────────────

/**
 * Format a tick timestamp using the adaptive strategy.
 * Date part uses Intl; time part (when included) appends "  HH:MM".
 */
export function formatTickAdaptive(
  ms: number,
  strategy: TickStrategy,
  locale?: string,
): string {
  const d = new Date(ms);
  const datePart = new Intl.DateTimeFormat(
    locale ?? "en-US",
    strategy.format,
  ).format(d);
  if (!strategy.includeTime) return datePart;
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${datePart}  ${h}:${m}`;
}

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};

/** @deprecated Use formatTickAdaptive with getAdaptiveTickStrategy instead. */
export function getAdaptiveFormat(
  tickIntervalMs: number,
): Intl.DateTimeFormatOptions {
  if (tickIntervalMs < MS.day)
    return {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
  if (tickIntervalMs < 90 * MS.day) return { month: "short", day: "numeric" };
  if (tickIntervalMs < 2 * 365 * MS.day)
    return { year: "numeric", month: "short", day: "numeric" };
  return { year: "numeric", month: "short" };
}

/** Format a millisecond timestamp to a human-readable tick label. */
export function formatTick(
  ms: number,
  locale?: string,
  format: Intl.DateTimeFormatOptions = DEFAULT_DATE_FORMAT,
): string {
  return new Intl.DateTimeFormat(locale, format).format(new Date(ms));
}
