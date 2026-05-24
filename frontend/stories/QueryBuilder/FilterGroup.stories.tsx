import React, { useCallback, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import FilterGroup, {
  type GroupChip,
  type GroupCombinator,
} from "../../components/QueryBuilder/FilterGroup";
import type { FilterChipField } from "../../components/QueryBuilder/FilterChip";

const meta: Meta<typeof FilterGroup> = {
  title: "QueryBuilder/FilterGroup",
  component: FilterGroup,
  parameters: { layout: "padded" },
};

export default meta;

type Story = StoryObj<typeof FilterGroup>;

// ─── Sample data ──────────────────────────────────────────────────────────────

const FIELDS: FilterChipField[] = [
  {
    key: "type",
    label: "Type",
    type: "select",
    options: ["text", "image", "audio"],
  },
  { key: "wordCount", label: "Word Count", type: "number" },
  { key: "synopsis", label: "Synopsis", type: "text" },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["draft", "in-progress", "done", "archived"],
  },
  { key: "createdAt", label: "Created At", type: "date" },
  { key: "pov", label: "POV", type: "resource-ref" },
];

const SAMPLE_CHIPS: GroupChip[] = [
  { id: "c1", field: FIELDS[0], operator: "is", value: "text" },
  { id: "c2", field: FIELDS[3], operator: "is-not", value: "done" },
  { id: "c3", field: FIELDS[1], operator: "is-less-than", value: 500 },
  { id: "c4", field: FIELDS[4], operator: "is-after", value: "2026-01-01" },
];

// ─── Static stories ───────────────────────────────────────────────────────────

/** Group of four conditions joined by "All of" (AND). */
export const Default: Story = {
  args: {
    combinator: "and",
    chips: SAMPLE_CHIPS,
    availableFields: FIELDS,
    matchCount: 42,
    onCombinatorChange: () => undefined,
    onChipUpdate: () => undefined,
    onChipAdd: () => undefined,
    onChipDelete: () => undefined,
    onChipDuplicate: () => undefined,
    onChipReorder: () => undefined,
  },
};

/** "Any of" variant — conditions joined by OR. */
export const AnyOf: Story = {
  args: {
    combinator: "or",
    chips: SAMPLE_CHIPS.slice(0, 3),
    availableFields: FIELDS,
    matchCount: 127,
    onCombinatorChange: () => undefined,
    onChipUpdate: () => undefined,
    onChipAdd: () => undefined,
    onChipDelete: () => undefined,
    onChipDuplicate: () => undefined,
    onChipReorder: () => undefined,
  },
};

/** New group with no chips yet — shows only the header and footer. */
export const Empty: Story = {
  args: {
    combinator: "and",
    chips: [],
    availableFields: FIELDS,
    onCombinatorChange: () => undefined,
    onChipUpdate: () => undefined,
    onChipAdd: () => undefined,
    onChipDelete: () => undefined,
    onChipDuplicate: () => undefined,
    onChipReorder: () => undefined,
  },
};

/** Singular match count label — shows "1 match" not "1 matches". */
export const SingleMatch: Story = {
  args: {
    combinator: "and",
    chips: SAMPLE_CHIPS.slice(0, 2),
    availableFields: FIELDS,
    matchCount: 1,
    onCombinatorChange: () => undefined,
    onChipUpdate: () => undefined,
    onChipAdd: () => undefined,
    onChipDelete: () => undefined,
    onChipDuplicate: () => undefined,
    onChipReorder: () => undefined,
  },
};

/** Group without match count — footer shows only "+ Add condition". */
export const NoMatchCount: Story = {
  args: {
    combinator: "and",
    chips: SAMPLE_CHIPS.slice(0, 2),
    availableFields: FIELDS,
    onCombinatorChange: () => undefined,
    onChipUpdate: () => undefined,
    onChipAdd: () => undefined,
    onChipDelete: () => undefined,
    onChipDuplicate: () => undefined,
    onChipReorder: () => undefined,
  },
};

// ─── Interactive ──────────────────────────────────────────────────────────────

let nextId = 10;

function makeBlankChip(): GroupChip {
  return { id: `chip-${nextId++}`, field: null, operator: null, value: null };
}

/**
 * Acceptance criterion: group with four chips; combinator toggles; drag
 * reorders; "+ Add condition" inserts a blank chip.
 */
export const Interactive: Story = {
  args: {
    combinator: "and",
    chips: SAMPLE_CHIPS,
    availableFields: FIELDS,
    matchCount: 42,
  },
  render: (args: React.ComponentProps<typeof FilterGroup>) => {
    const [combinator, setCombinator] = useState<GroupCombinator>(
      args.combinator,
    );
    const [chips, setChips] = useState<GroupChip[]>(args.chips);

    const handleChipUpdate = useCallback(
      (id: string, updates: Partial<Omit<GroupChip, "id">>) => {
        setChips((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        );
      },
      [],
    );

    const handleChipAdd = useCallback(() => {
      setChips((prev) => [...prev, makeBlankChip()]);
    }, []);

    const handleChipDelete = useCallback((id: string) => {
      setChips((prev) => prev.filter((c) => c.id !== id));
    }, []);

    const handleChipDuplicate = useCallback((id: string) => {
      setChips((prev) => {
        const index = prev.findIndex((c) => c.id === id);
        if (index === -1) return prev;
        const duplicate: GroupChip = { ...prev[index], id: `chip-${nextId++}` };
        const next = [...prev];
        next.splice(index + 1, 0, duplicate);
        return next;
      });
    }, []);

    const handleChipReorder = useCallback(
      (fromIndex: number, toIndex: number) => {
        setChips((prev) => {
          const next = [...prev];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return next;
        });
      },
      [],
    );

    return (
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxWidth: 520,
        }}
      >
        <p style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.5 }}>
          Toggle combinator · Add/delete/duplicate via ⋮ menu · Drag the grip
          handle to reorder
        </p>
        <FilterGroup
          combinator={combinator}
          chips={chips}
          availableFields={args.availableFields}
          matchCount={args.matchCount}
          onCombinatorChange={setCombinator}
          onChipUpdate={handleChipUpdate}
          onChipAdd={handleChipAdd}
          onChipDelete={handleChipDelete}
          onChipDuplicate={handleChipDuplicate}
          onChipReorder={handleChipReorder}
        />
        <pre style={{ fontFamily: "monospace", fontSize: 10, opacity: 0.4 }}>
          {JSON.stringify(
            {
              combinator,
              chips: chips.map((c) => ({
                id: c.id,
                field: c.field?.key ?? null,
                operator: c.operator,
                value: c.value,
              })),
            },
            null,
            2,
          )}
        </pre>
      </div>
    );
  },
};
