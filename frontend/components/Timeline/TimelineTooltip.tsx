import React from "react";
import type { TimelineItem } from "./types";
import { formatTooltipDate, formatTooltipDuration } from "./utils";

export interface TimelineTooltipProps {
  visible: boolean;
  x: number;
  y: number;
  item: TimelineItem | null;
  containerWidth: number;
  containerHeight: number;
}

export default function TimelineTooltip({
  visible,
  x,
  y,
  item,
  containerWidth,
  containerHeight,
}: TimelineTooltipProps): JSX.Element {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ left: x + 14, top: y - 10 });

  React.useLayoutEffect(() => {
    if (!ref.current || !visible) return;
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;

    let left = x + 14;
    let top = y - h - 10;

    if (left + w > containerWidth) {
      left = x - w - 14;
    }
    top = Math.max(4, Math.min(top, containerHeight - h - 4));

    setPos({ left, top });
  }, [visible, x, y, containerWidth, containerHeight]);

  const status = item?.status;
  const isFinal = status === "Final";

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        zIndex: 200,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.08s ease",
        background: "var(--color-gw-chrome2, #161614)",
        border: "0.5px solid var(--color-gw-secondary, #6A6864)",
        padding: "11px 13px",
        minWidth: 155,
        maxWidth: 230,
        borderRadius: 2,
      }}
    >
      {item && (
        <>
          {/* Scene name */}
          <div
            style={{
              fontFamily: "var(--font-sans, 'IBM Plex Sans', sans-serif)",
              fontWeight: 700,
              fontSize: 12,
              color: "var(--color-gw-primary, #F5F4F0)",
              marginBottom: 7,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </div>

          {/* Divider */}
          <div
            style={{
              height: "0.5px",
              background: "var(--color-gw-border, #2E2E2C)",
              marginBottom: 7,
            }}
          />

          {/* Key–value rows */}
          <TooltipRow
            label="DATE"
            value={formatTooltipDate(Date.parse(item.startDate))}
          />
          {item.metadata?.pov && (
            <TooltipRow label="POV" value={item.metadata.pov} />
          )}
          <TooltipRow
            label="DURATION"
            value={formatTooltipDuration(item.durationH ?? 0)}
          />
          {item.metadata?.folder && (
            <TooltipRow label="SOURCE" value={item.metadata.folder} />
          )}
          {item.metadata?.notes && (
            <TooltipRow label="NOTES" value={item.metadata.notes} />
          )}

          {/* Status badge */}
          {status && status !== "Draft" && (
            <div
              style={{
                marginTop: 7,
                display: "inline-block",
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                fontSize: 8,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "2px 7px",
                border: `0.5px solid ${isFinal ? "var(--color-gw-red-border, #D44040)" : "var(--color-gw-border, #2E2E2C)"}`,
                color: isFinal
                  ? "var(--color-gw-red, #D44040)"
                  : "var(--color-gw-secondary, #6A6864)",
              }}
            >
              {status}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TooltipRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        marginTop: 3,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
          fontSize: 9,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: "var(--color-gw-secondary, #6A6864)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
          fontSize: 9,
          letterSpacing: "0.06em",
          color: "var(--color-gw-primary, #F5F4F0)",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}
