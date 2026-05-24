import React, { useCallback, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import QueryBuilder, {
  type GlobalCombinator,
  type QueryGroup,
} from "../../components/QueryBuilder/QueryBuilder";
import type { QueryAST } from "../../src/lib/models/query-ast";
import type { GroupChip } from "../../components/QueryBuilder/FilterGroup";
import type { FilterChipField } from "../../components/QueryBuilder/FilterChip";

const meta: Meta<typeof QueryBuilder> = {
  title: "QueryBuilder/QueryBuilder",
  component: QueryBuilder,
  parameters: { layout: "padded" },
};

export default meta;

type Story = StoryObj<typeof QueryBuilder>;

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
  { key: "updatedAt", label: "Updated At", type: "date" },
  { key: "pov", label: "POV", type: "resource-ref" },
];

const GROUP_A_CHIPS: GroupChip[] = [
  { id: "a1", field: FIELDS[0], operator: "is", value: "text" },
  { id: "a2", field: FIELDS[3], operator: "is-not", value: "done" },
  { id: "a3", field: FIELDS[6], operator: "is", value: "Mara" },
  { id: "a4", field: FIELDS[1], operator: "is-less-than", value: 500 },
  { id: "a5", field: FIELDS[4], operator: "is-after", value: "2026-01-01" },
];

const GROUP_B_CHIPS: GroupChip[] = [
  {
    id: "b1",
    field: FIELDS[5],
    operator: "in-the-last",
    value: { amount: 7, unit: "days" },
  },
  { id: "b2", field: FIELDS[1], operator: "is-greater-than", value: 1000 },
];

const GROUP_A: QueryGroup = {
  id: "g1",
  combinator: "and",
  chips: GROUP_A_CHIPS,
  matchCount: 12,
};

const GROUP_B: QueryGroup = {
  id: "g2",
  combinator: "and",
  chips: GROUP_B_CHIPS,
  matchCount: 34,
};

// ─── Static stories ───────────────────────────────────────────────────────────

/**
 * Spec layout: two groups joined by OR, matching decisions/03-chip-ui.md.
 * Done-when criterion.
 */
export const TwoGroupsOr: Story = {
  args: {
    groups: [GROUP_A, GROUP_B],
    globalCombinator: "or",
    availableFields: FIELDS,
    matchCount: 46,
    onGlobalCombinatorChange: () => undefined,
    onGroupCombinatorChange: () => undefined,
    onGroupAdd: () => undefined,
    onGroupDelete: () => undefined,
    onChipUpdate: () => undefined,
    onChipAdd: () => undefined,
    onChipDelete: () => undefined,
    onChipDuplicate: () => undefined,
    onChipReorder: () => undefined,
  },
};

/** Two groups joined by AND. */
export const TwoGroupsAnd: Story = {
  args: {
    groups: [GROUP_A, GROUP_B],
    globalCombinator: "and",
    availableFields: FIELDS,
    matchCount: 8,
    onGlobalCombinatorChange: () => undefined,
    onGroupCombinatorChange: () => undefined,
    onGroupAdd: () => undefined,
    onGroupDelete: () => undefined,
    onChipUpdate: () => undefined,
    onChipAdd: () => undefined,
    onChipDelete: () => undefined,
    onChipDuplicate: () => undefined,
    onChipReorder: () => undefined,
  },
};

/** Single group — no combinator pill rendered. */
export const SingleGroup: Story = {
  args: {
    groups: [GROUP_A],
    globalCombinator: "and",
    availableFields: FIELDS,
    matchCount: 12,
    onGlobalCombinatorChange: () => undefined,
    onGroupCombinatorChange: () => undefined,
    onGroupAdd: () => undefined,
    onChipUpdate: () => undefined,
    onChipAdd: () => undefined,
    onChipDelete: () => undefined,
    onChipDuplicate: () => undefined,
    onChipReorder: () => undefined,
  },
};

/** No groups yet — shows empty state and the + Add group footer. */
export const Empty: Story = {
  args: {
    groups: [],
    globalCombinator: "and",
    availableFields: FIELDS,
    onGlobalCombinatorChange: () => undefined,
    onGroupAdd: () => undefined,
    onChipUpdate: () => undefined,
    onChipAdd: () => undefined,
    onChipDelete: () => undefined,
    onChipDuplicate: () => undefined,
    onChipReorder: () => undefined,
  },
};

// A 3-level AST that cannot be represented as chips
const THREE_LEVEL_AST: QueryAST = {
  op: "and",
  children: [
    {
      op: "or",
      children: [
        {
          op: "and",
          children: [
            { op: "eq", field: "type", value: "text" },
            { op: "gt", field: "wordCount", value: 500 },
          ],
        },
        {
          op: "and",
          children: [
            { op: "eq", field: "status", value: "done" },
            { op: "exists", field: "synopsis" },
          ],
        },
      ],
    },
    { op: "eq", field: "type", value: "image" },
  ],
};

/**
 * Advanced mode: query uses 3-level nesting. Shows the read-only banner;
 * clicking "Edit in advanced mode" opens the JSON editor inline.
 */
export const Advanced: Story = {
  args: {
    groups: [GROUP_A, GROUP_B],
    globalCombinator: "or",
    availableFields: FIELDS,
    matchCount: 46,
    isAdvanced: true,
    rawAst: THREE_LEVEL_AST,
    onGlobalCombinatorChange: () => undefined,
    onGroupAdd: () => undefined,
    onChipUpdate: () => undefined,
    onChipAdd: () => undefined,
    onChipDelete: () => undefined,
    onChipDuplicate: () => undefined,
    onChipReorder: () => undefined,
  },
};

/**
 * Advanced mode with restore: editing the JSON and clicking "Back to chip view"
 * restores the query to chip mode if the AST is two-level compatible.
 */
export const AdvancedInteractive: Story = {
  args: {
    groups: [GROUP_A, GROUP_B],
    globalCombinator: "or",
    availableFields: FIELDS,
    matchCount: 46,
    isAdvanced: true,
    rawAst: THREE_LEVEL_AST,
  },
  render: (args: React.ComponentProps<typeof QueryBuilder>) => {
    const [groups, setGroups] = useState<QueryGroup[]>(args.groups);
    const [globalCombinator, setGlobalCombinator] = useState<GlobalCombinator>(
      args.globalCombinator,
    );
    const [isAdvanced, setIsAdvanced] = useState(true);

    const handleRestoreFromAdvanced = useCallback(
      (restoredGroups: QueryGroup[], restoredCombinator: GlobalCombinator) => {
        setGroups(restoredGroups);
        setGlobalCombinator(restoredCombinator);
        setIsAdvanced(false);
      },
      [],
    );

    return (
      <div
        style={{
          padding: 24,
          maxWidth: 560,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <p style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.5 }}>
          Click "Edit in advanced mode" → edit the JSON to a 2-level AST → "Back
          to chip view".
        </p>
        <QueryBuilder
          groups={groups}
          globalCombinator={globalCombinator}
          availableFields={args.availableFields}
          matchCount={args.matchCount}
          isAdvanced={isAdvanced}
          rawAst={isAdvanced ? args.rawAst : undefined}
          onRestoreFromAdvanced={handleRestoreFromAdvanced}
          onGlobalCombinatorChange={setGlobalCombinator}
          onGroupAdd={() => undefined}
          onChipUpdate={() => undefined}
          onChipAdd={() => undefined}
          onChipDelete={() => undefined}
          onChipDuplicate={() => undefined}
          onChipReorder={() => undefined}
        />
      </div>
    );
  },
};

// ─── Interactive ──────────────────────────────────────────────────────────────

let nextGroupId = 10;
let nextChipId = 100;

function makeGroupId(): string {
  return `g${nextGroupId++}`;
}

function makeChipId(): string {
  return `chip${nextChipId++}`;
}

function makeBlankGroup(): QueryGroup {
  return {
    id: makeGroupId(),
    combinator: "and",
    chips: [{ id: makeChipId(), field: null, operator: null, value: null }],
  };
}

function makeBlankChip(): GroupChip {
  return { id: makeChipId(), field: null, operator: null, value: null };
}

/**
 * Acceptance criterion: two groups joined by OR; live match-count updates
 * as chips change (simulated here as chips × 3).
 */
export const Interactive: Story = {
  args: {
    groups: [GROUP_A, GROUP_B],
    globalCombinator: "or",
    availableFields: FIELDS,
    matchCount: 46,
  },
  render: (args: React.ComponentProps<typeof QueryBuilder>) => {
    const [groups, setGroups] = useState<QueryGroup[]>(args.groups);
    const [globalCombinator, setGlobalCombinator] = useState<GlobalCombinator>(
      args.globalCombinator,
    );

    // Simulated match count — updates as chips are added/removed.
    const totalChips = groups.reduce((n, g) => n + g.chips.length, 0);
    const simulatedMatchCount = Math.max(0, 120 - totalChips * 7);

    const handleGroupCombinatorChange = useCallback(
      (groupId: string, combinator: (typeof groups)[0]["combinator"]) => {
        setGroups((prev) =>
          prev.map((g) => (g.id === groupId ? { ...g, combinator } : g)),
        );
      },
      [],
    );

    const handleGroupAdd = useCallback(() => {
      setGroups((prev) => [...prev, makeBlankGroup()]);
    }, []);

    const handleGroupDelete = useCallback((groupId: string) => {
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
    }, []);

    const handleChipUpdate = useCallback(
      (
        groupId: string,
        chipId: string,
        updates: Partial<Omit<GroupChip, "id">>,
      ) => {
        setGroups((prev) =>
          prev.map((g) =>
            g.id !== groupId
              ? g
              : {
                  ...g,
                  chips: g.chips.map((c) =>
                    c.id === chipId ? { ...c, ...updates } : c,
                  ),
                },
          ),
        );
      },
      [],
    );

    const handleChipAdd = useCallback((groupId: string) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.id !== groupId ? g : { ...g, chips: [...g.chips, makeBlankChip()] },
        ),
      );
    }, []);

    const handleChipDelete = useCallback((groupId: string, chipId: string) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.id !== groupId
            ? g
            : { ...g, chips: g.chips.filter((c) => c.id !== chipId) },
        ),
      );
    }, []);

    const handleChipDuplicate = useCallback(
      (groupId: string, chipId: string) => {
        setGroups((prev) =>
          prev.map((g) => {
            if (g.id !== groupId) return g;
            const index = g.chips.findIndex((c) => c.id === chipId);
            if (index === -1) return g;
            const duplicate: GroupChip = {
              ...g.chips[index],
              id: makeChipId(),
            };
            const chips = [...g.chips];
            chips.splice(index + 1, 0, duplicate);
            return { ...g, chips };
          }),
        );
      },
      [],
    );

    const handleChipReorder = useCallback(
      (groupId: string, fromIndex: number, toIndex: number) => {
        setGroups((prev) =>
          prev.map((g) => {
            if (g.id !== groupId) return g;
            const chips = [...g.chips];
            const [moved] = chips.splice(fromIndex, 1);
            chips.splice(toIndex, 0, moved);
            return { ...g, chips };
          }),
        );
      },
      [],
    );

    return (
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxWidth: 560,
        }}
      >
        <p style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.5 }}>
          Toggle the combinator pill · Add/delete groups · Edit chips. Match
          count updates as chips change.
        </p>
        <QueryBuilder
          groups={groups}
          globalCombinator={globalCombinator}
          availableFields={args.availableFields}
          matchCount={simulatedMatchCount}
          onGlobalCombinatorChange={setGlobalCombinator}
          onGroupCombinatorChange={handleGroupCombinatorChange}
          onGroupAdd={handleGroupAdd}
          onGroupDelete={handleGroupDelete}
          onChipUpdate={handleChipUpdate}
          onChipAdd={handleChipAdd}
          onChipDelete={handleChipDelete}
          onChipDuplicate={handleChipDuplicate}
          onChipReorder={handleChipReorder}
        />
      </div>
    );
  },
};
