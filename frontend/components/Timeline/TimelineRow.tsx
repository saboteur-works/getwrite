import React from "react";
import type { TimelineItem, TimelineGroup } from "./types";
import { parseDateString, dateToPercent, formatDuration } from "./utils";
import TimelineChip from "./TimelineChip";

export type ChipVariant = "bar" | "pill" | "pin";

export interface TimelineRowProps {
    group?: TimelineGroup;
    items: TimelineItem[];
    axisBounds: { start: number; end: number };
    trackWidthPx: number;
}

const CHIP_HEIGHT = 22;
const LANE_GAP = 4;
const ROW_PADDING = 7;

interface ChipLayout {
    item: TimelineItem;
    leftPct: number;
    widthPct: number;
    variant: ChipVariant;
    lane: number;
    topOffset: number;
}

function computeLayouts(
    items: TimelineItem[],
    axisBounds: { start: number; end: number },
    trackWidthPx: number,
): ChipLayout[] {
    const spanMs = axisBounds.end - axisBounds.start;

    const raw = items.map((item) => {
        const startMs = parseDateString(item.startDate);
        const endMs = item.endDate ? parseDateString(item.endDate) : startMs;
        const leftPct = dateToPercent(startMs, axisBounds.start, axisBounds.end);
        const rawWidthPct = ((endMs - startMs) / spanMs) * 100;
        const widthPct = Math.max(1, rawWidthPct);
        return { item, leftPct, rawWidthPct, widthPct };
    });

    // Sort by left position for greedy lane assignment
    const sorted = raw.slice().sort((a, b) => a.leftPct - b.leftPct);

    const laneEnds: number[] = [];

    return sorted.map(({ item, leftPct, rawWidthPct, widthPct }) => {
        const physicalPx = (rawWidthPct / 100) * trackWidthPx;

        const variant: ChipVariant =
            physicalPx < 10 ? "pin"
            : physicalPx < 80 ? "pill"
            : "bar";

        const renderedWidthPx =
            variant === "bar" ? Math.max(physicalPx, 120)
            : variant === "pill" ? Math.max(physicalPx, 44)
            : 4;

        const leftPx = (leftPct / 100) * trackWidthPx;
        const rightPx = leftPx + renderedWidthPx;

        let lane = laneEnds.findIndex((end) => end <= leftPx);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = rightPx;

        const topOffset = lane * (CHIP_HEIGHT + LANE_GAP) + Math.floor(ROW_PADDING / 2);

        return { item, leftPct, widthPct, variant, lane, topOffset };
    });
}

export default function TimelineRow({
    group,
    items,
    axisBounds,
    trackWidthPx,
}: TimelineRowProps): JSX.Element {
    const layouts = React.useMemo(
        () => computeLayouts(items, axisBounds, trackWidthPx),
        [items, axisBounds, trackWidthPx],
    );

    const numLanes = layouts.length > 0
        ? Math.max(...layouts.map((c) => c.lane)) + 1
        : 1;
    const rowHeight = numLanes * CHIP_HEIGHT + (numLanes - 1) * LANE_GAP + ROW_PADDING;

    const spanMs = axisBounds.end - axisBounds.start;

    return (
        <div
            style={{
                display: "flex",
                height: `${rowHeight}px`,
                alignItems: "flex-start",
                borderBottom: "0.5px solid var(--timeline-row-separator)",
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
                        paddingTop: `${Math.floor(ROW_PADDING / 2)}px`,
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
                    height: `${rowHeight}px`,
                    backgroundColor: "var(--timeline-track-bg)",
                    borderRadius: "2px",
                }}
            >
                {layouts.map(({ item, leftPct, widthPct, variant, topOffset }) => (
                    <TimelineChip
                        key={item.id}
                        item={item}
                        leftPercent={leftPct}
                        widthPercent={widthPct}
                        variant={variant}
                        topOffset={topOffset}
                        rowHeight={rowHeight}
                    />
                ))}
                {(() => {
                    const threshold = spanMs * 0.05;
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
