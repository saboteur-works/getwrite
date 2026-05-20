import React, { useState } from "react";
import LabeledField from "./LabeledField";
import Input from "../../common/UI/Input/Input";
import Listbox from "../../common/UI/Listbox/Listbox";
import useDismissableMenu from "../../common/UI/hooks/useDismissableMenu";
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
    const [inputVal, setInputVal] = useState<string>(toDisplayString(value));
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const { containerRef } = useDismissableMenu({
        isOpen: open,
        onClose: () => setOpen(false),
    });

    React.useEffect(() => {
        setInputVal(toDisplayString(value));
    }, [value]);

    const filteredOptions = inputVal
        ? resourceOptions.filter((r) =>
              r.name.toLowerCase().includes(inputVal.toLowerCase()),
          )
        : resourceOptions;

    const listboxOptions = filteredOptions.map((r) => ({
        value: r.id,
        label: r.name,
    }));

    const handleSelect = (selectedId: string) => {
        const match = resourceOptions.find((r) => r.id === selectedId);
        if (match) {
            setInputVal(match.name);
            onChange?.({ id: match.id, name: match.name });
        }
        setOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open) {
            if (e.key === "ArrowDown" && listboxOptions.length > 0) {
                setOpen(true);
                e.preventDefault();
            }
            return;
        }
        if (e.key === "ArrowDown") {
            setHighlightedIndex((i) => (i + 1) % listboxOptions.length);
            e.preventDefault();
        } else if (e.key === "ArrowUp") {
            setHighlightedIndex(
                (i) => (i - 1 + listboxOptions.length) % listboxOptions.length,
            );
            e.preventDefault();
        } else if (e.key === "Enter") {
            const opt = listboxOptions[highlightedIndex];
            if (opt) handleSelect(opt.value);
            e.preventDefault();
        } else if (e.key === "Escape") {
            setOpen(false);
            e.preventDefault();
        }
    };

    return (
        <LabeledField label="POV" className={className}>
            <div ref={containerRef} className="relative mt-2">
                <Input
                    aria-label="pov-input"
                    value={inputVal}
                    onChange={(e) => {
                        const next = e.target.value;
                        setInputVal(next);
                        onChange?.(resolvePovValue(next, resourceOptions));
                        setOpen(next.length > 0 && filteredOptions.length > 0);
                        setHighlightedIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                    className="w-full"
                />
                {open && (
                    <Listbox
                        options={listboxOptions}
                        highlightedIndex={highlightedIndex}
                        onSelect={handleSelect}
                        onHighlightChange={setHighlightedIndex}
                        aria-label="POV options"
                    />
                )}
            </div>
        </LabeledField>
    );
}
