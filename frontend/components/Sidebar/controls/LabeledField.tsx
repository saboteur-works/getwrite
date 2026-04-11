import React from "react";

export interface LabeledFieldProps {
    label: string;
    children: React.ReactNode;
    className?: string;
}

/**
 * Sidebar control wrapper that renders a `text-sm font-medium` label
 * above the provided control slot.
 */
export default function LabeledField({
    label,
    children,
    className = "",
}: LabeledFieldProps): JSX.Element {
    return (
        <div className={className}>
            <label className="text-sm font-medium">{label}</label>
            {children}
        </div>
    );
}
