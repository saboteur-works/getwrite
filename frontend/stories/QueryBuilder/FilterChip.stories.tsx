import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import FilterChip, {
    type FilterChipField,
    type FilterChipValue,
} from "../../components/QueryBuilder/FilterChip";

const meta: Meta<typeof FilterChip> = {
    title: "QueryBuilder/FilterChip",
    component: FilterChip,
    parameters: {
        layout: "padded",
    },
};

export default meta;

type Story = StoryObj<typeof FilterChip>;

// ─── Sample fields ────────────────────────────────────────────────────────────

const FIELDS: Record<string, FilterChipField> = {
    synopsis: { key: "synopsis", label: "Synopsis", type: "text" },
    wordCount: { key: "wordCount", label: "Word count", type: "number" },
    createdAt: { key: "createdAt", label: "Created at", type: "date" },
    hasNotes: { key: "hasNotes", label: "Has notes", type: "boolean" },
    type: {
        key: "type",
        label: "Type",
        type: "select",
        options: ["text", "image", "audio"],
    },
    statuses: {
        key: "statuses",
        label: "Statuses",
        type: "multiselect",
        options: ["draft", "in-progress", "done"],
    },
    pov: { key: "pov", label: "POV", type: "resource-ref" },
    tags: { key: "tags", label: "Tags", type: "multi-resource-ref" },
};

const ALL_FIELDS = Object.values(FIELDS);

// ─── Per-type stories ─────────────────────────────────────────────────────────

export const TextField: Story = {
    args: {
        field: FIELDS.synopsis,
        operator: "contains",
        value: "morning",
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

export const NumberField: Story = {
    args: {
        field: FIELDS.wordCount,
        operator: "is-less-than",
        value: 500,
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

export const DateField: Story = {
    args: {
        field: FIELDS.createdAt,
        operator: "is-after",
        value: "2026-01-01",
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

export const BooleanField: Story = {
    args: {
        field: FIELDS.hasNotes,
        operator: "is-true",
        value: null,
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

export const SelectField: Story = {
    args: {
        field: FIELDS.type,
        operator: "is",
        value: "text",
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

export const MultiselectField: Story = {
    args: {
        field: FIELDS.statuses,
        operator: "includes",
        value: "draft",
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

export const ResourceRefField: Story = {
    args: {
        field: FIELDS.pov,
        operator: "is",
        value: "Mara",
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

export const MultiResourceRefField: Story = {
    args: {
        field: FIELDS.tags,
        operator: "includes",
        value: "antagonist",
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

// ─── Operator shape variants ──────────────────────────────────────────────────

export const IsEmpty: Story = {
    args: {
        field: FIELDS.synopsis,
        operator: "is-empty",
        value: null,
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

export const IsBetween: Story = {
    args: {
        field: FIELDS.wordCount,
        operator: "is-between",
        value: { from: 200, to: 800 },
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

export const InTheLast: Story = {
    args: {
        field: FIELDS.createdAt,
        operator: "in-the-last",
        value: { amount: 7, unit: "days" },
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

// ─── Error state ──────────────────────────────────────────────────────────────

export const WithError: Story = {
    args: {
        field: FIELDS.synopsis,
        operator: "matches-regex",
        value: "[invalid(regex",
        error: "Invalid regular expression",
        availableFields: ALL_FIELDS,
        onFieldChange: () => undefined,
        onOperatorChange: () => undefined,
        onValueChange: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onMove: () => undefined,
    },
};

// ─── Interactive ──────────────────────────────────────────────────────────────

export const Interactive: Story = {
    args: {
        field: FIELDS.wordCount,
        operator: "is-less-than",
        value: 500,
        availableFields: ALL_FIELDS,
    },
    render: (args) => {
        const [field, setField] = useState<FilterChipField | null>(
            args.field ?? null,
        );
        const [operator, setOperator] = useState<string | null>(
            args.operator ?? null,
        );
        const [value, setValue] = useState<FilterChipValue>(args.value ?? null);

        return (
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                <FilterChip
                    field={field}
                    operator={operator}
                    value={value}
                    availableFields={ALL_FIELDS}
                    onFieldChange={(f) => {
                        setField(f);
                        setOperator(null);
                        setValue(null);
                    }}
                    onOperatorChange={setOperator}
                    onValueChange={setValue}
                    onDuplicate={() => console.log("duplicate")}
                    onDelete={() => console.log("delete")}
                    onMove={(dir) => console.log("move", dir)}
                />
                <pre style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.6 }}>
                    {JSON.stringify({ field: field?.key, operator, value }, null, 2)}
                </pre>
            </div>
        );
    },
};
