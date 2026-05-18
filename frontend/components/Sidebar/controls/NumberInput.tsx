"use client";

import React from "react";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";

export interface NumberInputProps {
    /**
     * The field label displayed above the input.
     */
    label: string;
    /**
     * The current numeric value, or undefined if not set.
     */
    value?: number;
    /**
     * Callback fired when the input value changes.
     */
    onChange?: (value: number) => void;
    /**
     * Optional CSS class for the wrapper.
     */
    className?: string;
    /**
     * Optional aria-label for accessibility.
     */
    ariaLabel?: string;
}

export default function NumberInput({
    label,
    value,
    onChange,
    className = "",
    ariaLabel = "number-input",
}: NumberInputProps): JSX.Element {
    const defaultValue = 0;
    const [number, setNumber] = useSyncedControlledValue(
        value ?? defaultValue,
        onChange,
    );

    return (
        <LabeledField label={label} className={className}>
            <input
                type="number"
                aria-label={ariaLabel}
                className="w-full mt-2 p-2 border border-gw-border rounded text-sm"
                value={number}
                onChange={(e) => {
                    const v = e.target.value;
                    // Convert to number, or fall back to 0 if empty
                    const numValue = v === "" ? 0 : parseFloat(v);
                    if (!isNaN(numValue)) {
                        setNumber(numValue);
                    }
                }}
            />
        </LabeledField>
    );
}
