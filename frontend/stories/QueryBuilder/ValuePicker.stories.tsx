import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ValuePicker, {
    type ValuePickerValue,
    type ResourceOption,
} from "../../components/QueryBuilder/ValuePicker";
import RefHoverPreview from "../../components/QueryBuilder/RefHoverPreview";

const meta: Meta<typeof ValuePicker> = {
    title: "QueryBuilder/ValuePicker",
    component: ValuePicker,
    parameters: {
        layout: "padded",
    },
};

export default meta;

type Story = StoryObj<typeof ValuePicker>;

// ─── Sample data ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["draft", "in-progress", "done", "archived"];
const TYPE_OPTIONS = ["text", "image", "audio"];

const RESOURCE_OPTIONS: ResourceOption[] = [
    { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Mara" },
    { id: "aaaaaaaa-0000-0000-0000-000000000002", name: "Marabel" },
    { id: "aaaaaaaa-0000-0000-0000-000000000003", name: "Jonah" },
    { id: "aaaaaaaa-0000-0000-0000-000000000004", name: "The Lighthouse" },
    { id: "aaaaaaaa-0000-0000-0000-000000000005", name: "Act 1 - Departure" },
];

// ─── Text ─────────────────────────────────────────────────────────────────────

export const TextField: Story = {
    args: {
        fieldType: "text",
        operator: "contains",
        value: "morning",
        onChange: () => undefined,
    },
};

export const TextMatchesRegex: Story = {
    args: {
        fieldType: "text",
        operator: "matches-regex",
        value: "^Chapter \\d+",
        onChange: () => undefined,
    },
};

// ─── Number ───────────────────────────────────────────────────────────────────

export const NumberField: Story = {
    args: {
        fieldType: "number",
        operator: "is-less-than",
        value: 500,
        onChange: () => undefined,
    },
};

/** Acceptance criterion: "between" for numbers shows two side-by-side inputs. */
export const NumberBetween: Story = {
    args: {
        fieldType: "number",
        operator: "is-between",
        value: { from: 200, to: 800 },
        onChange: () => undefined,
    },
};

// ─── Date ─────────────────────────────────────────────────────────────────────

export const DateField: Story = {
    args: {
        fieldType: "date",
        operator: "is-after",
        value: "2026-01-01",
        onChange: () => undefined,
    },
};

export const DateBetween: Story = {
    args: {
        fieldType: "date",
        operator: "is-between",
        value: { from: "2026-01-01", to: "2026-06-30" },
        onChange: () => undefined,
    },
};

/** Acceptance criterion: "in the last" for dates shows amount + unit picker. */
export const InTheLast: Story = {
    args: {
        fieldType: "date",
        operator: "in-the-last",
        value: { amount: 7, unit: "days" },
        onChange: () => undefined,
    },
};

// ─── Boolean ──────────────────────────────────────────────────────────────────

/** Boolean operators carry the value — no value input is shown. */
export const BooleanField: Story = {
    args: {
        fieldType: "boolean",
        operator: "is-true",
        value: null,
        onChange: () => undefined,
    },
    render: (args) => (
        <div style={{ padding: 16 }}>
            <ValuePicker {...args} />
            <p
                style={{
                    fontFamily: "monospace",
                    fontSize: 11,
                    opacity: 0.5,
                    marginTop: 8,
                }}
            >
                (no value input — operator carries the value for boolean fields)
            </p>
        </div>
    ),
};

// ─── Select ───────────────────────────────────────────────────────────────────

export const SelectField: Story = {
    args: {
        fieldType: "select",
        operator: "is",
        value: "text",
        options: TYPE_OPTIONS,
        onChange: () => undefined,
    },
};

/** Acceptance criterion: multi-select for "is any of" shows chip strip. */
export const IsAnyOf: Story = {
    args: {
        fieldType: "select",
        operator: "is-any-of",
        value: ["draft", "in-progress"],
        options: STATUS_OPTIONS,
        onChange: () => undefined,
    },
};

export const IsAnyOfUnknown: Story = {
    args: {
        fieldType: "select",
        operator: "is-any-of",
        value: ["draft", "removed-status"],
        options: STATUS_OPTIONS,
        onChange: () => undefined,
    },
};

// ─── Multiselect ──────────────────────────────────────────────────────────────

export const MultiselectField: Story = {
    args: {
        fieldType: "multiselect",
        operator: "includes",
        value: "draft",
        options: STATUS_OPTIONS,
        onChange: () => undefined,
    },
};

export const MultiselectIncludesAllOf: Story = {
    args: {
        fieldType: "multiselect",
        operator: "includes-all-of",
        value: ["draft", "in-progress"],
        options: STATUS_OPTIONS,
        onChange: () => undefined,
    },
};

// ─── Resource ref ─────────────────────────────────────────────────────────────

/**
 * Acceptance criterion: resource-ref shows a typeahead with hover preview.
 * Hover over "Mara" chip to see the preview popover.
 */
export const ResourceRefField: Story = {
    args: {
        fieldType: "resource-ref",
        operator: "is",
        value: {
            id: "aaaaaaaa-0000-0000-0000-000000000001",
            name: "Mara",
        },
        resourceOptions: RESOURCE_OPTIONS,
        onChange: () => undefined,
    },
};

export const ResourceRefDeleted: Story = {
    args: {
        fieldType: "resource-ref",
        operator: "is",
        value: { id: null, name: "Deleted Character" },
        resourceOptions: RESOURCE_OPTIONS,
        onChange: () => undefined,
    },
};

export const ResourceRefEmpty: Story = {
    args: {
        fieldType: "resource-ref",
        operator: "is",
        value: null,
        resourceOptions: RESOURCE_OPTIONS,
        onChange: () => undefined,
    },
};

// ─── Multi-resource-ref ───────────────────────────────────────────────────────

export const MultiResourceRefField: Story = {
    args: {
        fieldType: "multi-resource-ref",
        operator: "includes",
        value: [
            {
                id: "aaaaaaaa-0000-0000-0000-000000000001",
                name: "Mara",
            },
            {
                id: "aaaaaaaa-0000-0000-0000-000000000003",
                name: "Jonah",
            },
        ],
        resourceOptions: RESOURCE_OPTIONS,
        onChange: () => undefined,
    },
};

export const MultiResourceRefMaxed: Story = {
    args: {
        fieldType: "multi-resource-ref",
        operator: "includes-any-of",
        value: [
            { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Mara" },
            { id: "aaaaaaaa-0000-0000-0000-000000000003", name: "Jonah" },
        ],
        resourceOptions: RESOURCE_OPTIONS,
        maxSelections: 2,
        onChange: () => undefined,
    },
};

// ─── Empty operators (no value) ───────────────────────────────────────────────

export const IsEmpty: Story = {
    args: {
        fieldType: "text",
        operator: "is-empty",
        value: null,
        onChange: () => undefined,
    },
    render: (args) => (
        <div style={{ padding: 16 }}>
            <ValuePicker {...args} />
            <p
                style={{
                    fontFamily: "monospace",
                    fontSize: 11,
                    opacity: 0.5,
                    marginTop: 8,
                }}
            >
                (no value input — "is empty" is self-contained)
            </p>
        </div>
    ),
};

// ─── Error state ──────────────────────────────────────────────────────────────

export const WithError: Story = {
    args: {
        fieldType: "text",
        operator: "matches-regex",
        value: "[invalid(regex",
        error: "Invalid regular expression",
        onChange: () => undefined,
    },
};

// ─── RefHoverPreview standalone ───────────────────────────────────────────────

export const HoverPreviewStory: StoryObj<typeof RefHoverPreview> = {
    name: "Ref Hover Preview",
    render: () => (
        <div style={{ padding: 32, display: "flex", gap: 16, alignItems: "center" }}>
            <RefHoverPreview
                resource={{ id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Mara" }}
            >
                <span
                    style={{
                        fontFamily: "monospace",
                        fontSize: 10,
                        border: "0.5px solid #2e2e2c",
                        padding: "2px 8px",
                        cursor: "default",
                    }}
                >
                    Mara
                </span>
            </RefHoverPreview>
            <RefHoverPreview
                resource={{ id: null, name: "Deleted Character" }}
            >
                <span
                    style={{
                        fontFamily: "monospace",
                        fontSize: 10,
                        border: "0.5px solid #2e2e2c",
                        padding: "2px 8px",
                        opacity: 0.5,
                        cursor: "default",
                    }}
                >
                    Deleted Character
                </span>
            </RefHoverPreview>
        </div>
    ),
    args: {
        resource: { id: "test", name: "Test" },
        children: null,
    },
};

// ─── Interactive ──────────────────────────────────────────────────────────────

export const Interactive: Story = {
    args: {
        fieldType: "select",
        operator: "is-any-of",
        value: [],
        options: STATUS_OPTIONS,
        onChange: () => undefined,
    },
    render: (args) => {
        const [value, setValue] = useState<ValuePickerValue>([]);

        return (
            <div
                style={{
                    padding: 24,
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                }}
            >
                <ValuePicker
                    {...args}
                    value={value}
                    onChange={setValue}
                />
                <pre
                    style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.5 }}
                >
                    {JSON.stringify(value, null, 2)}
                </pre>
            </div>
        );
    },
};

export const InteractiveResourceRef: Story = {
    args: {
        fieldType: "resource-ref",
        operator: "is",
        value: null,
        resourceOptions: RESOURCE_OPTIONS,
        onChange: () => undefined,
    },
    render: (args) => {
        const [value, setValue] = useState<ValuePickerValue>(null);

        return (
            <div
                style={{
                    padding: 24,
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                }}
            >
                <p
                    style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.5 }}
                >
                    Type "m" or "j" to see suggestions. Hover the chip to see
                    the preview.
                </p>
                <ValuePicker
                    {...args}
                    value={value}
                    onChange={setValue}
                />
                <pre
                    style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.5 }}
                >
                    {JSON.stringify(value, null, 2)}
                </pre>
            </div>
        );
    },
};
