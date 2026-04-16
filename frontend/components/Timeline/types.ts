/** A single event or scene placed on the story timeline. */
export interface TimelineItem {
    /** Stable unique identifier (matches the resource id). */
    id: string;
    /** Display label shown on the item chip. */
    label: string;
    /** ISO 8601 start date-time: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm". */
    startDate: string;
    /** ISO 8601 end date-time; derived from startDate + duration when present. */
    endDate?: string;
    /** Optional group id linking this item to a TimelineGroup row. */
    groupId?: string;
    /** Fired when the user clicks the item chip. */
    onClick?: (id: string) => void;
    /** Arbitrary consumer metadata — passed through, not rendered. */
    metadata?: Record<string, unknown>;
}

/** A row-level group shown in the group label column. */
export interface TimelineGroup {
    /** Stable unique identifier. */
    id: string;
    /** Human-readable row label (e.g. folder name). */
    label: string;
}

/** Optional configuration for axis rendering and date formatting. */
export interface TimelineConfig {
    /**
     * Explicit axis start boundary (ISO 8601).
     * Defaults to the earliest item startDate minus 5% padding.
     */
    axisStart?: string;
    /**
     * Explicit axis end boundary (ISO 8601).
     * Defaults to the latest item endDate (or startDate) plus 5% padding.
     */
    axisEnd?: string;
    /** Number of tick marks on the time axis. Defaults to 8. */
    tickCount?: number;
    /** Locale string passed to Intl.DateTimeFormat for tick labels. Defaults to browser locale. */
    locale?: string;
    /**
     * Intl.DateTimeFormatOptions for tick labels.
     * Defaults to { month: "short", day: "numeric" }.
     */
    dateFormat?: Intl.DateTimeFormatOptions;
    /**
     * Initial zoom level (1 = 100%, maximum 10).
     * Defaults to 1. The user can still zoom in/out via the controls after mount.
     */
    initialZoom?: number;
}

/** Props for the pure <Timeline> component. */
export interface TimelineProps {
    items: TimelineItem[];
    groups?: TimelineGroup[];
    config?: TimelineConfig;
    className?: string;
}
