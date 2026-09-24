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
const OUTLINE_STATUSES = ["Draft", "Outline", "In Progress"] as const;
const FINAL_STATUSES = ["Final", "Approved", "Published", "Polished"] as const;

/**
 * The positioned list-item box a chip's button sits in.
 *
 * Each chip used to BE a `<button role="listitem">`, inside the track's
 * `role="list"`. `listitem` is not an allowed role for a button and it
 * replaces, rather than adds to, the button semantics — so an activatable
 * chip was announced as a plain list item, with nothing to say it could be
 * clicked. Splitting the two puts the list semantics on the box and leaves
 * the button a button. The box carries the absolute positioning so the
 * button can simply fill it, which also keeps `outlineOverlay`'s `inset: 0`
 * resolving against the same rectangle as before.
 */
function ChipSlot({
  style,
  children,
}: {
  style: React.CSSProperties;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div role="listitem" style={{ position: "absolute", ...style }}>
      {children}
    </div>
  );
}

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
  const isFinal = FINAL_STATUSES.includes(
    status as (typeof FINAL_STATUSES)[number],
  );
  const isOutline = OUTLINE_STATUSES.includes(
    status as (typeof OUTLINE_STATUSES)[number],
  );

  if (variant === "pin") {
    return (
      <ChipSlot
        style={{
          left: `${leftPercent}%`,
          top: `${topOffset + PIN_TOP_PAD}px`,
          width: "var(--timeline-item-pin-width)",
          height: `${CHIP_HEIGHT}px`,
        }}
      >
        <button
          type="button"
          className="timeline-chip"
          aria-label={item.label}
          onClick={() => item.onClick?.(item.id)}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: item.color ?? "var(--timeline-item-bg)",
            borderRadius: "1px",
            border: "none",
            cursor: item.onClick ? "pointer" : "default",
            padding: 0,
            boxSizing: "border-box",
          }}
        />
      </ChipSlot>
    );
  }

  const slotStyle: React.CSSProperties = {
    left: `${leftPercent}%`,
    top: `${topOffset}px`,
    width: `${widthPercent}%`,
    height: "var(--timeline-item-height)",
  };

  const sharedStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
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
      <ChipSlot style={slotStyle}>
        <button
          type="button"
          className="timeline-chip"
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
      </ChipSlot>
    );
  }

  // "bar" variant
  return (
    <ChipSlot style={slotStyle}>
      <button
        type="button"
        className="timeline-chip"
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
    </ChipSlot>
  );
}
