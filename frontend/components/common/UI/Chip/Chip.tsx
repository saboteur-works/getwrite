"use client";

import React from "react";
import { X } from "lucide-react";
import { Tooltip } from "react-tooltip";
import { TOOLTIP_STYLE } from "../tooltipStyle";

export interface ChipProps {
  label: string;
  shape: "sharp" | "rounded";
  size?: "sm" | "md" | "lg";
  color?: string;
  active?: boolean;
  /** Renders with red border + red text (no fill) for assigned-tag canonical state. */
  tagActive?: boolean;
  onClick?: () => void;
  onDismiss?: () => void;
  tooltip?: string;
  tooltipId?: string;
}

export default function Chip({
  label,
  shape,
  size = "md",
  color,
  active,
  tagActive,
  onClick,
  onDismiss,
  tooltip,
  tooltipId,
}: ChipProps): JSX.Element {
  const activeModifier =
    tagActive && !color
      ? " chip--tag-active"
      : active && !color
        ? " chip--active"
        : "";
  const className = `chip chip--${shape} chip--${size}${activeModifier}`;
  const style: React.CSSProperties | undefined = color
    ? active
      ? { borderColor: color, backgroundColor: color, color: "#fff" } // GW-HEX-EXEMPT: white contrast text on user-chosen chip color
      : { borderColor: color, color }
    : undefined;
  const hasTooltip = Boolean(tooltip && tooltipId);
  const tooltipAnchorProps = hasTooltip
    ? { "data-tooltip-id": tooltipId, "data-tooltip-content": tooltip }
    : {};

  const dismissButton = onDismiss ? (
    <button
      type="button"
      className="chip__dismiss"
      aria-label="Remove"
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
    >
      <X size={12} aria-hidden="true" />
    </button>
  ) : null;

  let chipElement: JSX.Element;
  if (onDismiss) {
    const labelContent = onClick ? (
      <button type="button" className="chip__label-action" onClick={onClick}>
        {label}
      </button>
    ) : (
      label
    );

    chipElement = (
      <span className={className} style={style} {...tooltipAnchorProps}>
        {labelContent}
        {dismissButton}
      </span>
    );
  } else if (onClick) {
    chipElement = (
      <button
        type="button"
        className={className}
        style={style}
        onClick={onClick}
        aria-pressed={
          active !== undefined || tagActive !== undefined
            ? !!active || !!tagActive
            : undefined
        }
        {...tooltipAnchorProps}
      >
        {label}
      </button>
    );
  } else {
    chipElement = (
      <span className={className} style={style} {...tooltipAnchorProps}>
        {label}
      </span>
    );
  }

  if (hasTooltip) {
    return (
      <>
        {chipElement}
        <Tooltip id={tooltipId} place="top" style={TOOLTIP_STYLE} />
      </>
    );
  }

  return chipElement;
}
