"use client";

import React from "react";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";

export interface BooleanToggleProps {
    /**
     * The field label displayed next to the toggle.
     */
    label: string;
    /**
     * The current boolean value, or undefined if not set.
     */
    value?: boolean;
    /**
     * Callback fired when the toggle state changes.
     */
    onChange?: (value: boolean) => void;
    /**
     * Optional CSS class for the wrapper.
     */
    className?: string;
    /**
     * Optional aria-label for accessibility.
     */
    ariaLabel?: string;
}

export default function BooleanToggle({
    label,
    value,
    onChange,
    className = "",
    ariaLabel = "boolean-toggle",
}: BooleanToggleProps): JSX.Element {
    const [checked, setChecked] = useSyncedControlledValue(
        value ?? false,
        onChange,
    );

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <input
                type="checkbox"
                aria-label={ariaLabel}
                className="w-4 h-4"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
            />
            <label className="text-sm font-medium cursor-pointer">
                {label}
            </label>
        </div>
    );
}
