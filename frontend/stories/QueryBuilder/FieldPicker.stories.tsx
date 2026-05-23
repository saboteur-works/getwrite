import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import FieldPicker, {
  buildFieldPickerFields,
  type FieldPickerField,
} from "../../components/QueryBuilder/FieldPicker";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";

const meta: Meta<typeof FieldPicker> = {
  title: "QueryBuilder/FieldPicker",
  component: FieldPicker,
  parameters: { layout: "padded" },
};

export default meta;

type Story = StoryObj<typeof FieldPicker>;

// ─── Sample data ──────────────────────────────────────────────────────────────

/** Built-in + system only (no user-defined project fields). */
const DEFAULT_FIELDS = buildFieldPickerFields();

/** Schema with user-added project-extension groups, including a folder-scoped group. */
const PROJECT_SCHEMA = {
  groups: [
    ...DEFAULT_METADATA_SCHEMA.groups,
    {
      id: "project-characters",
      label: "Characters",
      fields: [
        { key: "role", label: "Role", type: "text" as const },
        { key: "motivation", label: "Motivation", type: "text" as const },
        {
          key: "arc",
          label: "Arc",
          type: "select" as const,
          options: ["positive", "negative", "flat"],
        },
      ],
    },
    {
      id: "project-scenes",
      label: "Scenes",
      folderId: "scenes-folder-uuid",
      fields: [
        {
          key: "tension",
          label: "Tension",
          type: "select" as const,
          options: ["low", "medium", "high"],
        },
        { key: "location", label: "Location", type: "resource-ref" as const },
      ],
    },
  ],
};

const PROJECT_FIELDS = buildFieldPickerFields(PROJECT_SCHEMA);

// ─── Static stories ───────────────────────────────────────────────────────────

/** All built-in and system fields; no project extension; no selection. */
export const Default: Story = {
  args: { fields: DEFAULT_FIELDS, value: null, onSelect: () => undefined },
};

/** Shows the trigger with a pre-selected field label. */
export const WithSelection: Story = {
  args: {
    fields: DEFAULT_FIELDS,
    value: "synopsis",
    onSelect: () => undefined,
  },
};

/** Includes user-added project fields in the Project section. */
export const WithProjectFields: Story = {
  args: { fields: PROJECT_FIELDS, value: null, onSelect: () => undefined },
};

/**
 * The "Scenes" group has a folderId — its fields show a "Scenes only"
 * scope annotation in the dropdown.
 */
export const WithFolderScopedFields: Story = {
  args: { fields: PROJECT_FIELDS, value: "tension", onSelect: () => undefined },
};

/**
 * When onEditField is provided, hovering a built-in or project field
 * reveals an "Edit" affordance linking to Schema Manager.
 */
export const WithEditAffordance: Story = {
  args: {
    fields: PROJECT_FIELDS,
    value: null,
    onSelect: () => undefined,
    onEditField: (key: string) => alert(`Open Schema Manager for: ${key}`),
  },
};

/** Trigger is non-interactive while disabled. */
export const Disabled: Story = {
  args: {
    fields: DEFAULT_FIELDS,
    value: null,
    disabled: true,
    onSelect: () => undefined,
  },
};

// ─── Interactive ──────────────────────────────────────────────────────────────

export const Interactive: Story = {
  args: { fields: PROJECT_FIELDS, value: null, onSelect: () => undefined },
  render: (args: React.ComponentProps<typeof FieldPicker>) => {
    const [selected, setSelected] = useState<FieldPickerField | null>(null);

    return (
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <p style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.5 }}>
          Click the trigger to open. Search by key or label (e.g. "status",
          "word", "pov"). Select a field to emit it.
        </p>
        <FieldPicker
          {...args}
          value={selected?.key ?? null}
          onSelect={(field) => setSelected(field)}
        />
        <pre style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.5 }}>
          {selected
            ? JSON.stringify(
                {
                  key: selected.key,
                  type: selected.type,
                  source: selected.source,
                },
                null,
                2,
              )
            : "(no field selected)"}
        </pre>
      </div>
    );
  },
};

/**
 * Acceptance criterion: when onAddField is provided and the search query
 * matches no fields, a "+ Create a new field" row appears at the bottom.
 * Type something that doesn't exist (e.g. "tension") to see the add row.
 */
export const InteractiveWithAddField: Story = {
  args: {
    fields: DEFAULT_FIELDS,
    value: null,
    onSelect: () => undefined,
    onAddField: (name: string) => alert(`Create new field: "${name}"`),
  },
  render: (args: React.ComponentProps<typeof FieldPicker>) => {
    const [selected, setSelected] = useState<FieldPickerField | null>(null);

    return (
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <p style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.5 }}>
          Type a name that doesn't exist yet (e.g. "tension") to see the "+
          Create a new field" affordance.
        </p>
        <FieldPicker
          {...args}
          value={selected?.key ?? null}
          onSelect={(field) => setSelected(field)}
        />
        <pre style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.5 }}>
          {selected ? JSON.stringify(selected, null, 2) : "(no field selected)"}
        </pre>
      </div>
    );
  },
};
