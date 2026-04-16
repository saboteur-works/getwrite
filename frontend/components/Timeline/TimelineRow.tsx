import React from "react";
import type { TimelineItem, TimelineGroup } from "./types";
import { parseDateString, dateToPercent } from "./utils";
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
            </div>
        </div>
    );
}
