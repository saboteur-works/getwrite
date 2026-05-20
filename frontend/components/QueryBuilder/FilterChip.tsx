"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, MoreHorizontal } from "lucide-react";
import type { MetadataFieldType } from "../../src/lib/models/types";
import {
    getDefaultOperator,
    getOperatorOption,
    getOperators,
} from "./operator-utils";
import "./filter-chip.css";

// ─── Value types ──────────────────────────────────────────────────────────────

export interface RelativeDateValue {
    amount: number;
    unit: "days" | "weeks" | "months";
}

export interface RangeValue {
    from: string | number;
    to: string | number;
}

export type FilterChipValue =
    | string
    | number
    | string[]
    | RelativeDateValue
    | RangeValue
    | null;

// ─── Field type ───────────────────────────────────────────────────────────────

export interface FilterChipField {
    key: string;
    label: string;
    type: MetadataFieldType;
    /** Allowed values for select / multiselect types. */
    options?: string[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface FilterChipProps {
    /** Currently selected field. Null when unset. */
    field: FilterChipField | null;
    /** Currently selected operator value (e.g. "is", "contains"). Null when unset. */
    operator: string | null;
    /** Current filter value. Null when the operator requires no value. */
    value: FilterChipValue;
    /** All available fields shown in the field picker dropdown. */
    availableFields?: FilterChipField[];
    /** Validation error message. When set, chip renders in error state. */
    error?: string;
    onFieldChange?: (field: FilterChipField | null) => void;
    onOperatorChange?: (operator: string | null) => void;
    onValueChange?: (value: FilterChipValue) => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
    onMove?: (direction: "up" | "down") => void;
}

// ─── Type guards ──────────────────────────────────────────────────────────────

function isRelativeDateValue(v: FilterChipValue): v is RelativeDateValue {
    return (
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        "amount" in v &&
        "unit" in v
    );
}

function isRangeValue(v: FilterChipValue): v is RangeValue {
    return (
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        "from" in v &&
        "to" in v
    );
}

// ─── Operator select ──────────────────────────────────────────────────────────

function OperatorSelect({
    fieldType,
    value,
    onChange,
}: {
    fieldType: MetadataFieldType;
    value: string;
    onChange: (v: string) => void;
}): JSX.Element {
    const groups = getOperators(fieldType);
    let dividerIndex = 0;

    return (
        <select
            className="filter-chip__select"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Operator"
        >
            {groups.map((entry, i) => {
                if (entry === "divider") {
                    return (
                        <option
                            key={`divider-${dividerIndex++}`}
                            disabled
                            value=""
                        >
                            ─────────────
                        </option>
                    );
                }
                return (
                    <option key={entry.value} value={entry.value}>
                        {entry.label}
                    </option>
                );
            })}
        </select>
    );
}

// ─── Value input ──────────────────────────────────────────────────────────────

function ValueInput({
    field,
    operatorValue,
    value,
    onChange,
}: {
    field: FilterChipField;
    operatorValue: string;
    value: FilterChipValue;
    onChange: (v: FilterChipValue) => void;
}): JSX.Element | null {
    const opOption = getOperatorOption(field.type, operatorValue);
    if (!opOption || opOption.noValue) return null;

    const { valueShape } = opOption;

    if (valueShape === "relativeDate") {
        const rel = isRelativeDateValue(value)
            ? value
            : { amount: 7, unit: "days" as const };
        return (
            <span className="filter-chip__value-relative">
                <input
                    type="number"
                    className="filter-chip__value-input filter-chip__value-input--number"
                    value={rel.amount}
                    min={1}
                    aria-label="Amount"
                    onChange={(e) =>
                        onChange({
                            amount: Math.max(1, Number(e.target.value)),
                            unit: rel.unit,
                        })
                    }
                />
                <select
                    className="filter-chip__value-unit"
                    value={rel.unit}
                    aria-label="Unit"
                    onChange={(e) =>
                        onChange({
                            amount: rel.amount,
                            unit: e.target.value as RelativeDateValue["unit"],
                        })
                    }
                >
                    <option value="days">days</option>
                    <option value="weeks">weeks</option>
                    <option value="months">months</option>
                </select>
            </span>
        );
    }

    if (valueShape === "twoValues") {
        const range = isRangeValue(value) ? value : { from: "", to: "" };
        if (field.type === "number") {
            return (
                <span className="filter-chip__value-range">
                    <input
                        type="number"
                        className="filter-chip__value-input filter-chip__value-input--number"
                        value={range.from as number}
                        aria-label="From"
                        onChange={(e) =>
                            onChange({ from: Number(e.target.value), to: range.to })
                        }
                    />
                    <span className="filter-chip__value-range-sep">–</span>
                    <input
                        type="number"
                        className="filter-chip__value-input filter-chip__value-input--number"
                        value={range.to as number}
                        aria-label="To"
                        onChange={(e) =>
                            onChange({ from: range.from, to: Number(e.target.value) })
                        }
                    />
                </span>
            );
        }
        return (
            <span className="filter-chip__value-range">
                <input
                    type="date"
                    className="filter-chip__value-input filter-chip__value-input--date"
                    value={range.from as string}
                    aria-label="From date"
                    onChange={(e) =>
                        onChange({ from: e.target.value, to: range.to })
                    }
                />
                <span className="filter-chip__value-range-sep">–</span>
                <input
                    type="date"
                    className="filter-chip__value-input filter-chip__value-input--date"
                    value={range.to as string}
                    aria-label="To date"
                    onChange={(e) =>
                        onChange({ from: range.from, to: e.target.value })
                    }
                />
            </span>
        );
    }

    if (valueShape === "multiValues") {
        const opts = field.options ?? [];
        const selected = Array.isArray(value) ? value : [];
        if (opts.length > 0) {
            return (
                <select
                    className="filter-chip__select"
                    multiple
                    value={selected}
                    aria-label="Values"
                    onChange={(e) => {
                        const picked = Array.from(e.target.selectedOptions).map(
                            (o) => o.value,
                        );
                        onChange(picked);
                    }}
                >
                    {opts.map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            );
        }
        return (
            <input
                type="text"
                className="filter-chip__value-input"
                value={typeof value === "string" ? value : ""}
                placeholder="values..."
                aria-label="Values"
                onChange={(e) => onChange(e.target.value)}
            />
        );
    }

    // single value
    switch (field.type) {
        case "number":
            return (
                <input
                    type="number"
                    className="filter-chip__value-input filter-chip__value-input--number"
                    value={typeof value === "number" ? value : ""}
                    aria-label="Value"
                    onChange={(e) => onChange(Number(e.target.value))}
                />
            );
        case "date":
            return (
                <input
                    type="date"
                    className="filter-chip__value-input filter-chip__value-input--date"
                    value={typeof value === "string" ? value : ""}
                    aria-label="Date"
                    onChange={(e) => onChange(e.target.value)}
                />
            );
        case "select":
        case "multiselect": {
            const opts = field.options ?? [];
            return (
                <select
                    className="filter-chip__select"
                    value={typeof value === "string" ? value : ""}
                    aria-label="Value"
                    onChange={(e) => onChange(e.target.value)}
                >
                    <option value="">select...</option>
                    {opts.map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            );
        }
        case "resource-ref":
        case "multi-resource-ref":
            return (
                <input
                    type="text"
                    className="filter-chip__value-input"
                    value={typeof value === "string" ? value : ""}
                    placeholder="resource..."
                    aria-label="Resource"
                    onChange={(e) => onChange(e.target.value)}
                />
            );
        default:
            return (
                <input
                    type="text"
                    className="filter-chip__value-input"
                    value={typeof value === "string" ? value : ""}
                    aria-label="Value"
                    onChange={(e) => onChange(e.target.value)}
                />
            );
    }
}

// ─── FilterChip ───────────────────────────────────────────────────────────────

export default function FilterChip({
    field,
    operator,
    value,
    availableFields,
    error,
    onFieldChange,
    onOperatorChange,
    onValueChange,
    onDuplicate,
    onDelete,
    onMove,
}: FilterChipProps): JSX.Element {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuWrapperRef = useRef<HTMLDivElement>(null);

    const closeMenu = useCallback(() => setMenuOpen(false), []);

    useEffect(() => {
        if (!menuOpen) return;
        function handleOutsideClick(e: MouseEvent): void {
            if (
                menuWrapperRef.current &&
                !menuWrapperRef.current.contains(e.target as Node)
            ) {
                closeMenu();
            }
        }
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [menuOpen, closeMenu]);

    function handleFieldChange(e: React.ChangeEvent<HTMLSelectElement>): void {
        if (!onFieldChange || !availableFields) return;
        const found = availableFields.find((f) => f.key === e.target.value);
        onFieldChange(found ?? null);
        if (onOperatorChange && found) {
            onOperatorChange(getDefaultOperator(found.type));
        }
        if (onValueChange) {
            onValueChange(null);
        }
    }

    function handleOperatorChange(next: string): void {
        if (!onOperatorChange || !field) return;
        const nextOption = getOperatorOption(field.type, next);
        onOperatorChange(next);
        if (nextOption?.noValue && onValueChange) {
            onValueChange(null);
        }
    }

    const effectiveOperator =
        operator ?? (field ? getDefaultOperator(field.type) : null);

    const hasMenu = Boolean(onDuplicate ?? onDelete ?? onMove);
    const outerClass = [
        "filter-chip",
        "chip",
        "chip--sharp",
        "chip--md",
        error ? "filter-chip--error" : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={outerClass} role="group" aria-label="Filter condition">
            <span className="filter-chip__drag" aria-label="Drag to reorder">
                <GripVertical size={12} aria-hidden="true" />
            </span>

            {/* Field slot */}
            <span className="filter-chip__slot filter-chip__slot--field">
                {availableFields ? (
                    <select
                        className="filter-chip__select"
                        value={field?.key ?? ""}
                        aria-label="Field"
                        onChange={handleFieldChange}
                    >
                        <option value="">field…</option>
                        {availableFields.map((f) => (
                            <option key={f.key} value={f.key}>
                                {f.label}
                            </option>
                        ))}
                    </select>
                ) : (
                    <span className="filter-chip__select" style={{ cursor: "default" }}>
                        {field?.label ?? "field…"}
                    </span>
                )}
            </span>

            {/* Operator slot */}
            {field && effectiveOperator && (
                <span className="filter-chip__slot filter-chip__slot--operator">
                    <OperatorSelect
                        fieldType={field.type}
                        value={effectiveOperator}
                        onChange={handleOperatorChange}
                    />
                </span>
            )}

            {/* Value slot */}
            {field && effectiveOperator && (
                <span className="filter-chip__slot filter-chip__slot--value">
                    <ValueInput
                        field={field}
                        operatorValue={effectiveOperator}
                        value={value}
                        onChange={onValueChange ?? (() => undefined)}
                    />
                </span>
            )}

            {/* Overflow menu */}
            {hasMenu && (
                <div className="filter-chip__overflow-wrapper" ref={menuWrapperRef}>
                    <button
                        type="button"
                        className="filter-chip__overflow"
                        aria-label="Chip actions"
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        onClick={() => setMenuOpen((v) => !v)}
                    >
                        <MoreHorizontal size={12} aria-hidden="true" />
                    </button>
                    {menuOpen && (
                        <div className="filter-chip__menu" role="menu">
                            {onDuplicate && (
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="filter-chip__menu-item"
                                    onClick={() => {
                                        onDuplicate();
                                        closeMenu();
                                    }}
                                >
                                    Duplicate
                                </button>
                            )}
                            {onMove && (
                                <>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="filter-chip__menu-item"
                                        onClick={() => {
                                            onMove("up");
                                            closeMenu();
                                        }}
                                    >
                                        Move up
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="filter-chip__menu-item"
                                        onClick={() => {
                                            onMove("down");
                                            closeMenu();
                                        }}
                                    >
                                        Move down
                                    </button>
                                </>
                            )}
                            {onDelete && (
                                <>
                                    {(onDuplicate ?? onMove) && (
                                        <div className="filter-chip__menu-divider" />
                                    )}
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="filter-chip__menu-item filter-chip__menu-item--destructive"
                                        onClick={() => {
                                            onDelete();
                                            closeMenu();
                                        }}
                                    >
                                        Delete
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
