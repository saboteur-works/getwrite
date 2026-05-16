import React from "react";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";

export interface StatusSelectorProps {
    value?: string;
    onChange?: (value: string) => void;
    className?: string;
    ariaLabel?: string;
    /** Ordered list of status strings to render as options. Defaults to ["Draft", "In review", "Published"]. */
    options?: string[];
}

const DEFAULT_OPTIONS = ["Draft", "In review", "Published"];

export default function StatusSelector({
    value,
    onChange,
    className = "",
    ariaLabel = "status-select",
    options = DEFAULT_OPTIONS,
}: StatusSelectorProps) {
    const defaultValue = options[0] ?? "";
    const [status, setStatus] = useSyncedControlledValue(value ?? defaultValue, onChange);

    return (
        <LabeledField label="Status" className={className}>
            <select
                aria-label={ariaLabel}
                className="w-full mt-2 p-2 border rounded text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
            >
                {options.map((opt) => (
                    <option key={opt} value={opt}>
                        {opt}
                    </option>
                ))}
            </select>
        </LabeledField>
    );
}
