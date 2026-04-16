import React from "react";
import type { TimelineItem } from "./types";

export interface TimelineChipProps {
    item: TimelineItem;
    leftPercent: number;
    widthPercent: number;
}

export default function TimelineChip({
    item,
    leftPercent,
    widthPercent,
}: TimelineChipProps): JSX.Element {
    return (
        <button
            role="listitem"
            aria-label={item.label}
            title={item.label}
            onClick={() => item.onClick?.(item.id)}
            style={{
                position: "absolute",
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                height: "var(--timeline-item-height)",
                backgroundColor: "var(--timeline-item-bg)",
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
