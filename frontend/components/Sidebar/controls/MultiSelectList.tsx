import React from "react";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";

export interface MultiSelectListProps {
    items: string[];
    selected?: string[];
    onChange?: (selected: string[]) => void;
    className?: string;
    label?: string;
}

export default function MultiSelectList({
    items,
    selected = [],
    onChange,
    className = "",
    label = "Items",
}: MultiSelectListProps) {
    const [sel, setSel] = useSyncedControlledValue<string[]>(
        selected,
        onChange,
    );

    const toggle = (item: string) => {
        const next = sel.includes(item)
            ? sel.filter((s) => s !== item)
            : [...sel, item];
        setSel(next);
    };

    return (
        <LabeledField label={label} className={className}>
            {items.length === 0 && (
                <p className="text-sm text-gw-secondary">
                    To select {label.toLowerCase()}, add text files to the{" "}
                    {label} folder.
                </p>
            )}
            <div className="mt-2 space-y-2">
                {items.map((it) => (
                    <label key={it} className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            aria-label={it}
                            checked={sel.includes(it)}
                            onChange={() => toggle(it)}
                        />
                        <span>{it}</span>
                    </label>
                ))}
            </div>
        </LabeledField>
    );
}
