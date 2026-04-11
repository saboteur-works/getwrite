import React from "react";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";

export interface POVAutocompleteProps {
    options?: string[];
    value?: string;
    onChange?: (value: string) => void;
    className?: string;
}

export default function POVAutocomplete({
    options = [],
    value = "",
    onChange,
    className = "",
}: POVAutocompleteProps) {
    const [val, setVal] = useSyncedControlledValue(value, onChange);

    return (
        <LabeledField label="POV" className={className}>
            <input
                list="pov-options"
                aria-label="pov-input"
                className="w-full mt-2 p-2 border border-brand-mid text-sm"
                value={val}
                onChange={(e) => setVal(e.target.value)}
            />
            <datalist id="pov-options">
                {options.map((o) => (
                    <option key={o} value={o} />
                ))}
            </datalist>
        </LabeledField>
    );
}
