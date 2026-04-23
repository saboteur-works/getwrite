import React from "react";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";

export interface DurationInputProps {
    value?: number | null; // minutes
    onChange?: (value: number | null) => void;
    className?: string;
    ariaLabel?: string;
}

export default function DurationInput({
    value = null,
    onChange,
    className = "",
    ariaLabel = "story-duration-input",
}: DurationInputProps) {
    const [displayValue, setDisplayValue] = useSyncedControlledValue<string>(
        value !== null && value !== undefined ? String(value) : "",
        (next) => {
            if (next === "") {
                onChange?.(null);
            } else {
                const parsed = parseInt(next, 10);
                if (!isNaN(parsed)) onChange?.(parsed);
            }
        },
    );

    return (
        <LabeledField label="Duration (min)" className={className}>
            <input
                type="number"
                aria-label={ariaLabel}
                className="w-full mt-2 p-2 border rounded text-sm"
                min={0}
                step={5}
                value={displayValue}
                onChange={(e) => setDisplayValue(e.target.value)}
            />
        </LabeledField>
    );
}
