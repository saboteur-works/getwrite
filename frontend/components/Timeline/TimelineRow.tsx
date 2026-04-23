import React from "react";
import type { TimelineItem, TimelineGroup } from "./types";
import { parseDateString, dateToPercent, formatDuration } from "./utils";
import TimelineChip from "./TimelineChip";

export interface TimelineRowProps {
    group?: TimelineGroup;
    items: TimelineItem[];
    axisBounds: { start: number; end: number };
}

export default function TimelineRow({
    group,
    items,
    axisBounds,
}: TimelineRowProps): JSX.Element {
    return (
        <div
            style={{
                display: "flex",
                height: "var(--timeline-row-height)",
                alignItems: "center",
            }}
        >
            {group && (
                <div
                    style={{
                        width: "var(--timeline-group-label-width)",
                        minWidth: "var(--timeline-group-label-width)",
                        color: "var(--timeline-group-label-color)",
                        fontFamily: "var(--timeline-font-family)",
                        fontSize: "var(--timeline-axis-label-size)",
                        paddingRight: "8px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        userSelect: "none",
                        flexShrink: 0,
                    }}
                >
                    {group.label}
                </div>
            )}

            <div
                role="list"
                aria-label={group ? `${group.label} items` : "timeline items"}
                style={{
                    flex: 1,
                    position: "relative",
                    height: "var(--timeline-row-height)",
                    backgroundColor: "var(--timeline-track-bg)",
                    borderRadius: "2px",
                }}
            >
                {items.map((item) => {
                    const startMs = parseDateString(item.startDate);
                    const endMs = item.endDate
                        ? parseDateString(item.endDate)
                        : startMs;
                    const spanMs = axisBounds.end - axisBounds.start;
                    const leftPct = dateToPercent(
                        startMs,
                        axisBounds.start,
                        axisBounds.end,
                    );
                    // Minimum 1% width so zero-duration items are visible as a point marker
                    const rawWidth =
                        ((endMs - startMs) / spanMs) * 100;
                    const widthPct = Math.max(1, rawWidth);
                    return (
                        <TimelineChip
                            key={item.id}
                            item={item}
                            leftPercent={leftPct}
                            widthPercent={widthPct}
                        />
                    );
                })}
                {(() => {
                    const axisSpan = axisBounds.end - axisBounds.start;
                    const threshold = axisSpan * 0.05;
                    const sorted = [...items].sort(
                        (a, b) => parseDateString(a.startDate) - parseDateString(b.startDate),
                    );
                    return sorted.flatMap((item, i) => {
                        if (i === 0) return [];
                        const prevEnd = sorted[i - 1].endDate
                            ? parseDateString(sorted[i - 1].endDate!)
                            : parseDateString(sorted[i - 1].startDate);
                        const nextStart = parseDateString(item.startDate);
                        const gapMs = nextStart - prevEnd;
                        if (gapMs <= threshold) return [];
                        const midMs = prevEnd + gapMs / 2;
                        const leftPct = dateToPercent(midMs, axisBounds.start, axisBounds.end);
                        return [(
                            <div
                                key={`gap-${i}`}
                                style={{
                                    position: "absolute",
                                    left: `${leftPct}%`,
                                    transform: "translateX(-50%)",
                                    top: 0,
                                    height: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    pointerEvents: "none",
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: "var(--timeline-axis-label-size)",
                                        color: "var(--timeline-axis-label-color)",
                                        opacity: 0.55,
                                        whiteSpace: "nowrap",
                                        userSelect: "none",
                                    }}
                                >
                                    ↔ {formatDuration(gapMs)}
                                </span>
                            </div>
                        )];
                    });
                })()}
            </div>
        </div>
    );
}
