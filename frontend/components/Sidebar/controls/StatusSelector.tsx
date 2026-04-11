import React from "react";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";

export interface StatusSelectorProps {
    value?: string;
    onChange?: (value: string) => void;
    className?: string;
    ariaLabel?: string;
}

export default function StatusSelector({
    value = "draft",
    onChange,
    className = "",
    ariaLabel = "status-select",
}: StatusSelectorProps) {
    const [status, setStatus] = useSyncedControlledValue(value, onChange);

    return (
        <LabeledField label="Status" className={className}>
            <select
                aria-label={ariaLabel}
                className="w-full mt-2 p-2 border rounded text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
            >
                <option value="draft">Draft</option>
                <option value="review">In review</option>
                <option value="published">Published</option>
            </select>
        </LabeledField>
    );
}
