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
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: () => void;
}

const CHIP_HEIGHT = 28;
const PIN_TOP_PAD = 6;

export default function TimelineChip({
    item,
    leftPercent,
    widthPercent,
    variant,
    topOffset,
    onMouseEnter,
    onMouseLeave,
}: TimelineChipProps): JSX.Element {
    const status = item.status;
    const isFinal = status === "Final";
    const isOutline = status === "Outline";

    if (variant === "pin") {
        return (
            <button
                className="timeline-chip"
                role="listitem"
                aria-label={item.label}
                onClick={() => item.onClick?.(item.id)}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                style={{
                    position: "absolute",
                    left: `${leftPercent}%`,
                    top: `${topOffset + PIN_TOP_PAD}px`,
                    width: "var(--timeline-item-pin-width)",
                    height: `${CHIP_HEIGHT}px`,
                    backgroundColor: item.color ?? "var(--timeline-item-bg)",
                    borderRadius: "1px",
                    border: "none",
                    cursor: item.onClick ? "pointer" : "default",
                    padding: 0,
                    boxSizing: "border-box",
                }}
            />
        );
    }

    const sharedStyle: React.CSSProperties = {
        position: "absolute",
        left: `${leftPercent}%`,
        top: `${topOffset}px`,
        width: `${widthPercent}%`,
        height: "var(--timeline-item-height)",
        backgroundColor: item.color ?? "var(--timeline-item-bg)",
        color: "rgba(10,10,10,0.82)",
        borderRadius: "var(--timeline-item-radius)",
        fontFamily: "var(--timeline-font-family)",
        border: "none",
        cursor: item.onClick ? "pointer" : "default",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        textAlign: "left",
        ...(isFinal ? { boxShadow: "inset 2px 0 0 rgba(212,64,64,0.75)" } : {}),
        ...(isOutline ? { opacity: 0.72 } : {}),
    };

    const outlineOverlay = isOutline ? (
        <span
            style={{
                position: "absolute",
                inset: 0,
                borderRadius: "var(--timeline-item-radius)",
                pointerEvents: "none",
                background:
                    "repeating-linear-gradient(45deg, var(--timeline-outline-stripe) 0px, var(--timeline-outline-stripe) 1.5px, transparent 1.5px, transparent 5px)",
            }}
        />
    ) : null;

    if (variant === "pill") {
        return (
            <button
                className="timeline-chip"
                role="listitem"
                aria-label={item.label}
                onClick={() => item.onClick?.(item.id)}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                style={{
                    ...sharedStyle,
                    fontSize: "8px",
                    letterSpacing: "0.04em",
                    padding: "0 5px",
                }}
            >
                {item.label.split(" ")[0]}
                {outlineOverlay}
            </button>
        );
    }

    // "bar" variant
    return (
        <button
            className="timeline-chip"
            role="listitem"
            aria-label={item.label}
            onClick={() => item.onClick?.(item.id)}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{
                ...sharedStyle,
                fontSize: "9px",
                letterSpacing: "0.06em",
                padding: "0 7px",
            }}
        >
            {item.label}
            {outlineOverlay}
        </button>
    );
}
