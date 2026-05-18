"use client";

import React from "react";
import { X } from "lucide-react";

export interface ChipProps {
    label: string;
    shape: "sharp" | "rounded";
    size?: "sm" | "md" | "lg";
    color?: string;
    onClick?: () => void;
    onDismiss?: () => void;
}

export default function Chip({
    label,
    shape,
    size = "md",
    color,
    onClick,
    onDismiss,
}: ChipProps): JSX.Element {
    const className = `chip chip--${shape} chip--${size}`;
    const style = color ? { borderColor: color, color } : undefined;

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
    if (onDismiss) {
        return (
            <span
                className={className}
                style={style}
                onClick={onClick}
                role={onClick ? "button" : undefined}
                tabIndex={onClick ? 0 : undefined}
            >
                {label}
                {dismissButton}
            </span>
        );
    }

    if (onClick) {
        return (
            <button
                type="button"
                className={className}
                style={style}
                onClick={onClick}
            >
                {label}
            </button>
        );
    }

    return (
        <span className={className} style={style}>
            {label}
        </span>
    );
}
