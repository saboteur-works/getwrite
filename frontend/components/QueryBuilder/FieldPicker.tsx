"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { MetadataFieldType, MetadataSchema } from "../../src/lib/models/types";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import { INTRINSIC_FIELDS } from "../../src/lib/models/query-intrinsics";
import "./field-picker.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldPickerSource = "builtin" | "project" | "system";

export interface FieldPickerField {
    key: string;
    label: string;
    type: MetadataFieldType;
    /** Determines which group section the field appears in. */
    source: FieldPickerSource;
    /** Group label shown as an annotation when the group has a folderId. */
    folderScope?: string;
    /** Options for select / multiselect field types. */
    options?: string[];
}

export interface FieldPickerProps {
    /** Queryable fields to enumerate. Use buildFieldPickerFields() to produce this. */
    fields: FieldPickerField[];
    /** Currently selected field key, or null when unset. */
    value: string | null;
    /** Called when the user picks a field from the list. */
    onSelect: (field: FieldPickerField) => void;
    /**
     * When provided, shows a "+ Create a new field '{query}'" row at the bottom
     * when the search query matches nothing. The search string is passed as the
     * argument so the caller can pre-populate the SchemaManager form.
     */
    onAddField?: (name: string) => void;
    /**
     * When provided, a hover "Edit" affordance appears on builtin and project
     * field rows. The field key is passed to the callback.
     */
    onEditField?: (fieldKey: string) => void;
    disabled?: boolean;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Merges the project's metadataSchema with system intrinsics into a flat
 * FieldPickerField list, tagged by source layer. Groups with id starting with
 * "builtin-" are "builtin"; all others are "project". Intrinsics are "system".
 *
 * Pass the merged project schema (project.config.metadataSchema) or omit to
 * get built-in + system fields only.
 */
export function buildFieldPickerFields(schema?: MetadataSchema): FieldPickerField[] {
    const fields: FieldPickerField[] = [];
    const effectiveSchema = schema ?? DEFAULT_METADATA_SCHEMA;

    for (const group of effectiveSchema.groups) {
        const isBuiltin = group.id.startsWith("builtin-");
        const folderScope = !isBuiltin && group.folderId ? `${group.label} only` : undefined;

        for (const field of group.fields) {
            fields.push({
                key: field.key,
                label: field.label,
                type: field.type,
                source: isBuiltin ? "builtin" : "project",
                folderScope,
                options: field.options,
            });
        }
    }

    for (const f of INTRINSIC_FIELDS) {
        fields.push({
            key: f.key,
            label: f.label,
            type: f.type,
            source: "system",
        });
    }

    return fields;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<FieldPickerSource, string> = {
    builtin: "Built-in",
    project: "Project",
    system: "System",
};

const SOURCE_ORDER: FieldPickerSource[] = ["builtin", "project", "system"];

// ─── Search ───────────────────────────────────────────────────────────────────

function matchesSearch(field: FieldPickerField, query: string): boolean {
    const q = query.toLowerCase();
    return (
        field.key.toLowerCase().includes(q) ||
        field.label.toLowerCase().includes(q)
    );
}

// ─── FieldPicker ──────────────────────────────────────────────────────────────

export default function FieldPicker({
    fields,
    value,
    onSelect,
    onAddField,
    onEditField,
    disabled = false,
}: FieldPickerProps): JSX.Element {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const wrapperRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const closeMenu = useCallback(() => {
        setOpen(false);
        setSearch("");
    }, []);

    useEffect(() => {
        if (!open) return;
        function handleOutsideClick(e: MouseEvent): void {
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(e.target as Node)
            ) {
                closeMenu();
            }
        }
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [open, closeMenu]);

    useEffect(() => {
        if (open) {
            searchRef.current?.focus();
        }
    }, [open]);

    const currentField = value ? fields.find((f) => f.key === value) ?? null : null;

    const filteredFields = search.trim()
        ? fields.filter((f) => matchesSearch(f, search))
        : fields;

    const groupedBySource: Record<FieldPickerSource, FieldPickerField[]> = {
        builtin: [],
        project: [],
        system: [],
    };
    for (const f of filteredFields) {
        groupedBySource[f.source].push(f);
    }

    const showAddRow =
        Boolean(onAddField) &&
        search.trim().length > 0 &&
        filteredFields.length === 0;

    function handleSelect(field: FieldPickerField): void {
        onSelect(field);
        closeMenu();
    }

    return (
        <div className="field-picker" ref={wrapperRef}>
            <button
                type="button"
                className="field-picker__trigger"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={
                    currentField
                        ? `Field: ${currentField.label}`
                        : "Select a field"
                }
                onClick={() => {
                    if (!disabled) setOpen((v) => !v);
                }}
            >
                <span className="field-picker__trigger-label">
                    {currentField?.label ?? "field…"}
                </span>
                <span
                    className={
                        open
                            ? "field-picker__chevron--open"
                            : "field-picker__chevron"
                    }
                >
                    <ChevronDown size={10} aria-hidden="true" />
                </span>
            </button>

            {open && (
                <div
                    className="field-picker__dropdown"
                    role="listbox"
                    aria-label="Select a field"
                >
                    <div className="field-picker__search-wrapper">
                        <input
                            ref={searchRef}
                            type="text"
                            className="field-picker__search"
                            placeholder="Search fields…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            aria-label="Search fields"
                            onKeyDown={(e) => {
                                if (e.key === "Escape") closeMenu();
                            }}
                        />
                    </div>

                    {SOURCE_ORDER.map((source) => {
                        const section = groupedBySource[source];
                        if (section.length === 0) return null;
                        return (
                            <div key={source} className="field-picker__section">
                                <div className="field-picker__section-header">
                                    {SOURCE_LABELS[source]}
                                </div>
                                {section.map((field) => (
                                    <div
                                        key={field.key}
                                        role="option"
                                        aria-selected={field.key === value}
                                        tabIndex={0}
                                        className={
                                            field.key === value
                                                ? "field-picker__item field-picker__item--selected"
                                                : "field-picker__item"
                                        }
                                        onClick={() => handleSelect(field)}
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                            ) {
                                                e.preventDefault();
                                                handleSelect(field);
                                            }
                                        }}
                                    >
                                        <span className="field-picker__item-label">
                                            {field.label}
                                        </span>
                                        <span className="field-picker__item-meta">
                                            {field.folderScope && (
                                                <span className="field-picker__scope">
                                                    {field.folderScope}
                                                </span>
                                            )}
                                            <span
                                                className={`field-picker__badge field-picker__badge--${field.source}`}
                                            >
                                                {field.source}
                                            </span>
                                            {onEditField &&
                                                field.source !== "system" && (
                                                    <button
                                                        type="button"
                                                        className="field-picker__item-edit"
                                                        aria-label={`Edit ${field.label} in Schema Manager`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onEditField(
                                                                field.key,
                                                            );
                                                            closeMenu();
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        );
                    })}

                    {filteredFields.length === 0 && !showAddRow && (
                        <div className="field-picker__empty">
                            No fields match
                        </div>
                    )}

                    {showAddRow && (
                        <button
                            type="button"
                            className="field-picker__add"
                            onClick={() => {
                                onAddField?.(search.trim());
                                closeMenu();
                            }}
                        >
                            + Create a new field "{search.trim()}"
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
