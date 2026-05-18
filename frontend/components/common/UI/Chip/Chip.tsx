"use client";

import React from "react";

export interface ChipProps {
    label: string;
    shape: "sharp" | "rounded";
    size?: "sm" | "md" | "lg";
    color?: string;
    onClick?: () => void;
}

export default function Chip({
    label,
    shape,
    size = "md",
    color,
    onClick,
}: ChipProps): JSX.Element {
    const className = `chip chip--${shape} chip--${size}`;
    const style = color ? { borderColor: color, color } : undefined;

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
