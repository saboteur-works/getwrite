"use client";

import React from "react";
import LabeledField from "./LabeledField";
import Chip from "../../common/UI/Chip/Chip";
import { useAppDispatch } from "../../../src/store/hooks";
import Input from "../../common/UI/Input/Input";
import Listbox from "../../common/UI/Listbox/Listbox";
import { setSelectedResourceId } from "../../../src/store/resourcesSlice";
import type { ResourceRef } from "../../../src/lib/models/types";
import type { ResourceOption } from "./ResourceRefInput";

export type { ResourceOption };

export interface MultiResourceRefInputProps {
    label: string;
    /** Autocomplete candidates — filtering by folder scope is the parent's responsibility. */
    resourceOptions?: ResourceOption[];
    /** Current selected refs. */
    value?: ResourceRef[];
    /** Called with the full updated refs array on every change. */
    onChange?: (value: ResourceRef[]) => void;
    /** Maximum number of selections allowed; unset means unbounded. */
    maxSelections?: number;
    /** Seed the text input on first render (does not make the input controlled). */
    defaultInputValue?: string;
    className?: string;
}

function filterOptions(
    query: string,
    options: ResourceOption[],
    selected: Set<string>,
): ResourceOption[] {
    if (!query) return [];
    const q = query.toLowerCase();
    return options.filter(
        (opt) =>
            opt.name.toLowerCase().includes(q) &&
            !selected.has(opt.name.toLowerCase()),
    );
}

export default function MultiResourceRefInput({
    label,
    resourceOptions = [],
    value = [],
    onChange,
    maxSelections,
    defaultInputValue,
    className = "",
}: MultiResourceRefInputProps): JSX.Element {
    const dispatch = useAppDispatch();
    const [inputVal, setInputVal] = React.useState(defaultInputValue ?? "");
    const [suggestions, setSuggestions] = React.useState<ResourceOption[]>(() => {
        if (!defaultInputValue) return [];
        const selected = new Set(value.map((r) => r.name.toLowerCase()));
        return filterOptions(defaultInputValue, resourceOptions, selected);
    });

    const atCap = maxSelections !== undefined && value.length >= maxSelections;

    const selectedNames = React.useMemo(
        () => new Set(value.map((r) => r.name.toLowerCase())),
        [value],
    );

    const addRef = (option: ResourceOption) => {
        if (atCap) return;
        onChange?.([...value, { id: option.id, name: option.name }]);
        setInputVal("");
        setSuggestions([]);
    };

    const removeRef = (index: number) => {
        onChange?.(value.filter((_, i) => i !== index));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        setInputVal(next);
        setSuggestions(filterOptions(next, resourceOptions, selectedNames));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && inputVal === "") {
            if (value.length > 0) removeRef(value.length - 1);
            return;
        }
        if (e.key === "Escape") {
            setSuggestions([]);
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            const match = suggestions.find(
                (opt) => opt.name.toLowerCase() === inputVal.toLowerCase(),
            );
            if (match) addRef(match);
        }
    };

    const handleBlur = () => {
        setSuggestions([]);
    };

    return (
        <LabeledField label={label} className={className}>
            <div className="relative mt-2">
                {value.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                        {value.map((ref, i) => {
                            const refId = ref.id;
                            return (
                                <Chip
                                    key={`${refId ?? "null"}-${i}`}
                                    label={ref.name}
                                    shape="sharp"
                                    size="sm"
                                    onDismiss={() => removeRef(i)}
                                    onClick={
                                        refId !== null
                                            ? () => dispatch(setSelectedResourceId(refId))
                                            : undefined
                                    }
                                />
                            );
                        })}
                    </div>
                )}
                <Input
                    type="text"
                    aria-label="multi-resource-ref-input"
                    className="w-full"
                    value={inputVal}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    placeholder="Search resources..."
                    autoComplete="off"
                    disabled={atCap}
                />
                <Listbox
                    options={suggestions.map((opt) => ({
                        value: opt.id ?? opt.name,
                        label: opt.name,
                    }))}
                    highlightedIndex={-1}
                    onSelect={(val) => {
                        const match = suggestions.find(
                            (opt) => (opt.id ?? opt.name) === val,
                        );
                        if (match) addRef(match);
                    }}
                    aria-label="Resource suggestions"
                />
            </div>
        </LabeledField>
    );
}
