import React from "react";
import LabeledField from "./LabeledField";
import type { ResourceRef } from "../../../src/lib/models/types";

export interface POVResourceOption {
    id: string;
    name: string;
}

export interface POVAutocompleteProps {
    resourceOptions?: POVResourceOption[];
    value?: string | ResourceRef;
    onChange?: (value: ResourceRef) => void;
    className?: string;
}

export function resolvePovValue(
    name: string,
    resourceOptions: POVResourceOption[],
): ResourceRef {
    const match = resourceOptions.find(
        (r) => r.name.toLowerCase() === name.toLowerCase(),
    );
    return match ? { id: match.id, name: match.name } : { id: null, name };
}

function toDisplayString(v: string | ResourceRef | undefined | null): string {
    if (v == null) return "";
    if (typeof v === "string") return v;
    return v.name;
}

export default function POVAutocomplete({
    resourceOptions = [],
    value,
    onChange,
    className = "",
}: POVAutocompleteProps) {
    const [inputVal, setInputVal] = React.useState<string>(toDisplayString(value));

    React.useEffect(() => {
        setInputVal(toDisplayString(value));
    }, [value]);

    return (
        <LabeledField label="POV" className={className}>
            <input
                list="pov-options"
                aria-label="pov-input"
                className="w-full mt-2 p-2 border border-brand-mid text-sm"
                value={inputVal}
                onChange={(e) => {
                    const next = e.target.value;
                    setInputVal(next);
                    onChange?.(resolvePovValue(next, resourceOptions));
                }}
            />
            <datalist id="pov-options">
                {resourceOptions.map((o) => (
                    <option key={o.id} value={o.name} />
                ))}
            </datalist>
        </LabeledField>
    );
}
