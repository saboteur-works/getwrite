import React from "react";
import type { TimelineItem, TimelineGroup } from "./types";
import { parseDateString, dateToPercent, formatGapLabel } from "./utils";
import TimelineChip from "./TimelineChip";

export type ChipVariant = "bar" | "pill" | "pin";

export interface TimelineRowProps {
    group?: TimelineGroup;
    items: TimelineItem[];
    axisBounds: { start: number; end: number };
    trackWidthPx: number;
    rowIndex: number;
    ticks: number[];
    labelWidth: number;
    onChipHover: (item: TimelineItem | null, x: number, y: number) => void;
}

const CHIP_HEIGHT = 28;
const LANE_SLOT = 40; // 28px chip + 6px top + 6px bottom
const ROW_PADDING = 16; // 2 × 8px

interface ChipLayout {
    item: TimelineItem;
    leftPct: number;
    widthPct: number;
    variant: ChipVariant;
    lane: number;
    topOffset: number;
}

function isPin(item: TimelineItem, physicalPx: number): boolean {
    if (item.durationH === 0) return true;
    if (item.durationH === undefined && !item.endDate) return physicalPx < 2;
    return false;
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
        const leftPct = dateToPercent(
            startMs,
            axisBounds.start,
            axisBounds.end,
        );
        const rawWidthPct = ((endMs - startMs) / spanMs) * 100;
        const widthPct = Math.max(0.01, rawWidthPct);
        return { item, leftPct, rawWidthPct, widthPct };
    });

    const sorted = raw.slice().sort((a, b) => a.leftPct - b.leftPct);

    const laneEnds: number[] = [];

    return sorted.map(({ item, leftPct, rawWidthPct, widthPct }) => {
        const physicalPx = (rawWidthPct / 100) * trackWidthPx;

        const variant: ChipVariant = isPin(item, physicalPx)
            ? "pin"
            : physicalPx < 48
              ? "pill"
              : "bar";

        const renderedWidthPx = variant === "pin" ? 2 : physicalPx;

        const leftPx = (leftPct / 100) * trackWidthPx;
        const rightPx = leftPx + renderedWidthPx;

        let lane = laneEnds.findIndex((end) => end + 6 <= leftPx);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = rightPx;

        const topOffset = lane * LANE_SLOT;

        return { item, leftPct, widthPct, variant, lane, topOffset };
    });
}

export default function TimelineRow({
    group,
    items,
    axisBounds,
    trackWidthPx,
    rowIndex,
    ticks,
    labelWidth,
    onChipHover,
}: TimelineRowProps): JSX.Element {
    const layouts = React.useMemo(
        () => computeLayouts(items, axisBounds, trackWidthPx),
        [items, axisBounds, trackWidthPx],
    );

    const numLanes =
        layouts.length > 0 ? Math.max(...layouts.map((c) => c.lane)) + 1 : 1;
    const rowHeight = Math.max(56, numLanes * LANE_SLOT + ROW_PADDING);

    const spanMs = axisBounds.end - axisBounds.start;

    const isEven = rowIndex % 2 === 0;

    return (
        <div
            style={{
                display: "flex",
                height: `${rowHeight}px`,
                alignItems: "flex-start",
                borderBottom: "0.5px solid var(--timeline-row-separator)",
            }}
        >
            {/* Row label — sticky left */}
            <div
                style={{
                    width: labelWidth,
                    minWidth: labelWidth,
                    position: "sticky",
                    left: 0,
                    zIndex: 5,
                    background: "var(--color-gw-chrome2, var(--timeline-bg))",
                    borderRight: "0.5px solid var(--timeline-axis-color)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: "6px 10px",
                    height: "100%",
                    boxSizing: "border-box",
                    flexShrink: 0,
                    overflow: "hidden",
                }}
            >
                {group && (
                    <>
                        <span
                            style={{
                                fontFamily: "var(--timeline-font-family)",
                                fontSize: "9px",
                                letterSpacing: "0.14em",
                                textTransform: "uppercase",
                                color: "var(--timeline-axis-label-color)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                userSelect: "none",
                            }}
                        >
                            {group.label}
                        </span>
                        <span
                            style={{
                                fontFamily: "var(--timeline-font-family)",
                                fontSize: "8px",
                                letterSpacing: "0.08em",
                                color: "var(--color-gw-secondary)",
                                marginTop: 3,
                                userSelect: "none",
                            }}
                        >
                            {items.length}{" "}
                            {items.length === 1 ? "scene" : "scenes"}
                        </span>
                    </>
                )}
            </div>

            {/* Track */}
            <div
                role="list"
                aria-label={group ? `${group.label} items` : "timeline items"}
                style={{
                    flex: 1,
                    position: "relative",
                    height: `${rowHeight}px`,
                    backgroundColor: isEven
                        ? "var(--timeline-track-bg)"
                        : `color-mix(in srgb, var(--timeline-track-bg) 100%, transparent)`,
                    boxSizing: "border-box",
                }}
            >
                {/* Even-row tint overlay */}
                {isEven && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            background: "var(--timeline-row-tint)",
                            pointerEvents: "none",
                            zIndex: 0,
                        }}
                    />
                )}

                {/* Gridlines */}
                {ticks.map((tick) => {
                    const leftPct = dateToPercent(
                        tick,
                        axisBounds.start,
                        axisBounds.end,
                    );
                    return (
                        <div
                            key={tick}
                            style={{
                                position: "absolute",
                                left: `${leftPct}%`,
                                top: 0,
                                bottom: 0,
                                width: "0.5px",
                                background: "var(--timeline-row-separator)",
                                zIndex: 0,
                                pointerEvents: "none",
                            }}
                        />
                    );
                })}

                {/* Chips */}
                {layouts.map(
                    ({ item, leftPct, widthPct, variant, topOffset }) => (
                        <TimelineChip
                            key={item.id}
                            item={item}
                            leftPercent={leftPct}
                            widthPercent={widthPct}
                            variant={variant}
                            topOffset={topOffset + Math.floor(ROW_PADDING / 2)}
                            rowHeight={rowHeight}
                            onMouseEnter={(e) => {
                                const rect = (
                                    e.currentTarget.closest(
                                        ".timeline-root",
                                    ) as HTMLElement
                                )?.getBoundingClientRect();
                                if (!rect) return;
                                onChipHover(
                                    item,
                                    e.clientX - rect.left,
                                    e.clientY - rect.top,
                                );
                            }}
                            onMouseLeave={() => onChipHover(null, 0, 0)}
                        />
                    ),
                )}

                {/* Gap labels — lane 0 only */}
                {(() => {
                    const threshold = spanMs * 0.05;
                    const sorted = [...items].sort(
                        (a, b) =>
                            parseDateString(a.startDate) -
                            parseDateString(b.startDate),
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
                        const leftPct = dateToPercent(
                            midMs,
                            axisBounds.start,
                            axisBounds.end,
                        );
                        const laneTop = Math.floor(ROW_PADDING / 2);
                        return [
                            <div
                                key={`gap-${i}`}
                                style={{
                                    position: "absolute",
                                    left: `${leftPct}%`,
                                    transform: "translateX(-50%)",
                                    top: laneTop,
                                    height: CHIP_HEIGHT,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    pointerEvents: "none",
                                    zIndex: 1,
                                }}
                            >
                                <span
                                    style={{
                                        fontFamily:
                                            "var(--timeline-font-family)",
                                        fontSize: "8px",
                                        letterSpacing: "0.08em",
                                        color: "var(--timeline-axis-color)",
                                        whiteSpace: "nowrap",
                                        userSelect: "none",
                                    }}
                                >
                                    {formatGapLabel(gapMs)}
                                </span>
                            </div>,
                        ];
                    });
                })()}
            </div>
        </div>
    );
}
