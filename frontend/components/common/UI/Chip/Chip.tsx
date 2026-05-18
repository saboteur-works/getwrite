"use client";

import React from "react";
import { X } from "lucide-react";
import { Tooltip } from "react-tooltip";

export interface ChipProps {
    label: string;
    shape: "sharp" | "rounded";
    size?: "sm" | "md" | "lg";
    color?: string;
    onClick?: () => void;
    onDismiss?: () => void;
    tooltip?: string;
    tooltipId?: string;
}

const TOOLTIP_STYLE: React.CSSProperties = {
    background: "var(--color-gw-chrome2, #161614)",
    border: "0.5px solid var(--color-gw-secondary, #6A6864)",
    color: "var(--color-gw-primary, #F5F4F0)",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "9px",
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    borderRadius: "1px",
    padding: "4px 8px",
};

export default function Chip({
    label,
    shape,
    size = "md",
    color,
    onClick,
    onDismiss,
    tooltip,
    tooltipId,
}: ChipProps): JSX.Element {
    const className = `chip chip--${shape} chip--${size}`;
    const style = color ? { borderColor: color, color } : undefined;
    const hasTooltip = Boolean(tooltip && tooltipId);
    const tooltipAnchorProps = hasTooltip
        ? {
              "data-tooltip-id": tooltipId,
              "data-tooltip-content": tooltip,
          }
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

    // When onDismiss is present, use a span root to avoid nesting <button> inside <button>.
    // onClick is still attached to the span for interactive+dismissible chips.
    let chipElement: JSX.Element;
    if (onDismiss) {
        chipElement = (
            <span
                className={className}
                style={style}
                onClick={onClick}
                role={onClick ? "button" : undefined}
                tabIndex={onClick ? 0 : undefined}
                {...tooltipAnchorProps}
            >
                {label}
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
