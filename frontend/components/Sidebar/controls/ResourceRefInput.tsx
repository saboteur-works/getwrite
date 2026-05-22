"use client";

import React from "react";
import LabeledField from "./LabeledField";
import Input from "../../common/UI/Input/Input";
import type { ResourceRef } from "../../../src/lib/models/types";

export interface ResourceOption {
    id: string;
    name: string;
}

export interface ResourceRefInputProps {
    /**
     * The field label displayed above the input.
     */
    label: string;
    /**
     * Available resources to select from (filtered by folder scope if applicable).
     */
    resourceOptions?: ResourceOption[];
    /**
     * The current value: single ResourceRef or array of ResourceRefs.
     */
    value?: ResourceRef | ResourceRef[] | null;
    /**
     * Callback fired when the value changes.
     * For single ref: passes ResourceRef
     * For multiple: passes ResourceRef[]
     */
    onChange?: (value: ResourceRef | ResourceRef[]) => void;
    /**
     * When true, allow selecting multiple resources. Defaults to false.
     */
    multiple?: boolean;
    /**
     * Optional CSS class for the wrapper.
     */
    className?: string;
    /**
     * Optional aria-label for accessibility.
     */
    ariaLabel?: string;
}

function resolveResourceRef(
    name: string,
    resourceOptions: ResourceOption[],
): ResourceRef {
    const match = resourceOptions.find(
        (r) => r.name.toLowerCase() === name.toLowerCase(),
    );
    return match ? { id: match.id, name: match.name } : { id: null, name };
}

function toDisplayString(
    v: ResourceRef | ResourceRef[] | string | undefined | null,
): string {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) {
        // For multiple, join all names with comma
        return v.map((ref) => ref.name).join(", ");
    }
    return v.name;
}

export default function ResourceRefInput({
    label,
    resourceOptions = [],
    value,
    onChange,
    multiple = false,
    className = "",
    ariaLabel = "resource-ref-input",
}: ResourceRefInputProps): JSX.Element {
    const [inputVal, setInputVal] = React.useState<string>(
        toDisplayString(value),
    );
    const [suggestions, setSuggestions] = React.useState<ResourceOption[]>([]);

    React.useEffect(() => {
        setInputVal(toDisplayString(value));
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        setInputVal(next);

        if (multiple) {
            // For multiple, show suggestions while typing the last item
            const items = next.split(",").map((s) => s.trim());
            const currentInput = items[items.length - 1] ?? "";
            const filtered = resourceOptions.filter((opt) =>
                opt.name.toLowerCase().includes(currentInput.toLowerCase()),
            );
            setSuggestions(filtered);
        } else {
            // For single, show suggestions as you type
            const filtered = resourceOptions.filter((opt) =>
                opt.name.toLowerCase().includes(next.toLowerCase()),
            );
            setSuggestions(filtered);
        }

        // For single value, resolve immediately
        if (!multiple) {
            onChange?.(resolveResourceRef(next, resourceOptions));
        }
    };

    const handleSuggestionClick = (option: ResourceOption) => {
        if (multiple) {
            // For multiple: add to list
            const items = inputVal.split(",").map((s) => s.trim());
            items[items.length - 1] = option.name;
            const newInput = items.join(", ");
            setInputVal(newInput);

            // Parse the refs from input
            const refs = items.map((name) =>
                resolveResourceRef(name, resourceOptions),
            );
            onChange?.(refs);
            setSuggestions([]);
        } else {
            // For single: replace
            setInputVal(option.name);
            onChange?.({ id: option.id, name: option.name });
            setSuggestions([]);
        }
    };

    return (
        <LabeledField label={label} className={className}>
            <div className="relative">
                <Input
                    type="text"
                    aria-label={ariaLabel}
                    className="w-full mt-2"
                    value={inputVal}
                    onChange={handleInputChange}
                    placeholder={
                        multiple
                            ? "Enter resource names, separated by commas"
                            : "Search resources..."
                    }
                    autoComplete="off"
                />
                {suggestions.length > 0 && (
                    <ul className="absolute top-full left-0 right-0 mt-1 bg-gw-chrome border border-gw-border shadow-md max-h-48 overflow-y-auto z-10">
                        {suggestions.map((opt) => (
                            <li
                                key={opt.id}
                                className="px-3 py-2 cursor-pointer hover:bg-gw-chrome2 text-sm"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleSuggestionClick(opt)}
                            >
                                {opt.name}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </LabeledField>
    );
}
