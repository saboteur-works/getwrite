import React from "react";
import type { TimelineItem } from "./types";
import type { ChipVariant } from "./TimelineRow";

export interface TimelineChipProps {
    item: TimelineItem;
    leftPercent: number;
    widthPercent: number;
    variant: ChipVariant;
    topOffset: number;
    rowHeight: number;
}

const PIN_HEIGHT_INSET = 6; // px inset from row top/bottom for pin height

export default function TimelineChip({
    item,
    leftPercent,
    widthPercent,
    variant,
    topOffset,
    rowHeight,
}: TimelineChipProps): JSX.Element {
    const sharedTooltipProps = {
        "data-tooltip-id": "timeline-chip-tooltip",
        "data-label": item.label,
        "data-date-range": item.tooltip ?? "",
        "data-pov": item.metadata?.pov ?? "",
        "data-status": Array.isArray(item.metadata?.status)
            ? item.metadata.status.join(", ")
            : (item.metadata?.status as string | undefined) ?? "",
        "data-folder": item.metadata?.folder ?? "",
        "data-notes": item.metadata?.notes ?? "",
    };

    if (variant === "pin") {
        const pinHeight = rowHeight - PIN_HEIGHT_INSET;
        return (
            <button
                className="timeline-chip"
                role="listitem"
                aria-label={item.label}
                onClick={() => item.onClick?.(item.id)}
                {...sharedTooltipProps}
                style={{
                    position: "absolute",
                    left: `${leftPercent}%`,
                    top: `${PIN_HEIGHT_INSET / 2}px`,
                    width: "var(--timeline-item-pin-width)",
                    height: `${pinHeight}px`,
                    backgroundColor: item.color ?? "var(--timeline-item-bg)",
                    borderRadius: "2px",
                    border: "none",
                    cursor: item.onClick ? "pointer" : "default",
                    padding: 0,
                    boxSizing: "border-box",
                }}
            />
        );
    }

    if (variant === "pill") {
        const firstWord = item.label.split(" ")[0];
        return (
            <button
                className="timeline-chip"
                role="listitem"
                aria-label={item.label}
                onClick={() => item.onClick?.(item.id)}
                {...sharedTooltipProps}
                style={{
                    position: "absolute",
                    left: `${leftPercent}%`,
                    top: `${topOffset}px`,
                    width: `${widthPercent}%`,
                    minWidth: "var(--timeline-item-pill-min-width)",
                    height: "var(--timeline-item-height)",
                    backgroundColor: item.color ?? "var(--timeline-item-bg)",
                    color: "var(--timeline-item-color)",
                    borderRadius: "var(--timeline-item-radius)",
                    fontFamily: "var(--timeline-font-family)",
                    fontSize: "var(--timeline-axis-label-size)",
                    border: "none",
                    cursor: item.onClick ? "pointer" : "default",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    padding: "0 5px",
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    textAlign: "left",
                    opacity: 0.9,
                }}
            >
                {firstWord}
            </button>
        );
    }

    // "bar" variant — full label
    return (
        <button
            className="timeline-chip"
            role="listitem"
            aria-label={item.label}
            onClick={() => item.onClick?.(item.id)}
            {...sharedTooltipProps}
            style={{
                position: "absolute",
                left: `${leftPercent}%`,
                top: `${topOffset}px`,
                width: `${widthPercent}%`,
                minWidth: "var(--timeline-item-min-width)",
                height: "var(--timeline-item-height)",
                backgroundColor: item.color ?? "var(--timeline-item-bg)",
                color: "var(--timeline-item-color)",
                borderRadius: "var(--timeline-item-radius)",
                fontFamily: "var(--timeline-font-family)",
                fontSize: "var(--timeline-axis-label-size)",
                border: "none",
                cursor: item.onClick ? "pointer" : "default",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                padding: "0 6px",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                textAlign: "left",
            }}
        >
            {item.label}
        </button>
    );
}
