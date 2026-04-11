"use client";

import React from "react";

export interface HeadingStyleFieldProps {
    id?: string;
    label: string;
    children: React.ReactNode;
}

/**
 * Labelled field wrapper for the heading settings form.
 * Renders the `flex flex-col gap-2` container with the shared monospace
 * uppercase label span, then slots in the provided control as children.
 */
export default function HeadingStyleField({
    id,
    label,
    children,
}: HeadingStyleFieldProps): JSX.Element {
    return (
        <label htmlFor={id} className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary">
                {label}
            </span>
            {children}
        </label>
    );
}
