import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { action } from "storybook/actions";
import { expect, userEvent, within } from "storybook/test";
import OrganizerGrid from "../../components/WorkArea/Views/OrganizerView/OrganizerGrid";
import OrganizerPhoneGroups from "../../components/WorkArea/Views/OrganizerView/OrganizerPhoneGroups";
import OrganizerGridToolbar, {
  type OrganizerAxisChoice,
  type OrganizerSmartFolderChoice,
} from "../../components/WorkArea/Views/OrganizerView/OrganizerGridToolbar";
import OrganizerArrangementControls from "../../components/WorkArea/Views/OrganizerView/OrganizerArrangementControls";
import OrganizerToolbarArea from "../../components/WorkArea/Views/OrganizerView/OrganizerToolbarArea";
import type { UseOrganizerPicksResult } from "../../components/WorkArea/Views/OrganizerView/useOrganizerPicks";
import {
  buildOrganizerGridModel,
  buildOrganizerPhoneGroups,
  type OrganizerGridResult,
} from "../../components/WorkArea/Views/OrganizerView/organizerGridModel";
import { createTextResource } from "../../src/lib/models/resource-factory";
import type { AnyResource } from "../../src/lib/models/types";
import type {
  OrganizerArrangement,
  OrganizerArrangementAvailability,
  OrganizerAxis,
  OrganizerAxisValueList,
  OrganizerSource,
} from "../../src/lib/models/organizer-grid-types";

/**
 * Stories for the Organizer grid (Feature 109, FR-11, FR-19): the matrix, the
 * phone groups, the toolbar and the arrangement controls. Presentational
 * components only; `OrganizerView` is not used. The source-state notes (failed
 * with retry, deleted, no match, `N not shown`) are story-local text standing
 * in for the view's own messages.
 *
 * The phone story id is `workarea-organizergrid--phone-groups`; a Playwright
 * spec resizes the viewport to 360px against that id.
 */

const meta: Meta = {
  title: "WorkArea/OrganizerGrid",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Realistic data: a short story project
// ---------------------------------------------------------------------------

const STATUS_AXIS: OrganizerAxis = { kind: "status" };
const ACT_AXIS: OrganizerAxis = { kind: "field", key: "act" };

const statusList: OrganizerAxisValueList = {
  axis: STATUS_AXIS,
  values: ["Draft", "Revising", "Final"].map((v) => ({
    key: v,
    kind: "value",
    label: v,
    isDropTarget: true,
    value: v,
  })),
};

const actList: OrganizerAxisValueList = {
  axis: ACT_AXIS,
  values: ["Act 1", "Act 2"].map((v) => ({
    key: v,
    kind: "value",
    label: v,
    isDropTarget: true,
    value: v,
  })),
};

interface Seed {
  name: string;
  status?: string;
  act?: string[];
  body: string;
}

const SEEDS: Seed[] = [
  {
    name: "The Lighthouse Keeper",
    status: "Draft",
    act: ["Act 1"],
    body: "Mara arrives at the rock before the storm does.",
  },
  {
    name: "Letters Home",
    status: "Draft",
    act: ["Act 2"],
    body: "Three letters, none of them sent.",
  },
  {
    name: "The Crossing",
    status: "Revising",
    act: ["Act 1", "Act 2"],
    body: "Told once in each act, from two points of view.",
  },
  {
    name: "Salt and Iron",
    status: "Final",
    act: ["Act 2"],
    body: "The repair that takes the whole winter.",
  },
  {
    name: "Island Weather Notes",
    status: "Parked",
    act: ["Act 1"],
    body: "Research notes; the status was set by an older template.",
  },
  { name: "Unsorted Fragments", body: "No status and no act yet." },
];

interface Scenario {
  byId: Map<string, AnyResource>;
  model: OrganizerGridResult;
}

function buildScenario(seeds: Seed[], cap: number | null): Scenario {
  const resources = seeds.map(
    (s, i): AnyResource =>
      createTextResource({
        name: s.name,
        plainText: s.body,
        orderIndex: i,
        userMetadata: {
          ...(s.status ? { status: s.status } : {}),
          ...(s.act ? { act: s.act } : {}),
        },
      }),
  );
  const model = buildOrganizerGridModel({
    cards: resources.map((r) => ({ id: r.id, kind: "resource" as const })),
    rows: {
      axis: STATUS_AXIS,
      list: statusList,
      values: new Map(resources.map((r) => [r.id, r.userMetadata?.status])),
    },
    columns: {
      axis: ACT_AXIS,
      list: actList,
      values: new Map(resources.map((r) => [r.id, r.userMetadata?.act])),
    },
    cap,
  });
  return { byId: new Map(resources.map((r) => [r.id, r])), model };
}

function bodyOf(scenario: Scenario, cardId: string): string {
  const resource = scenario.byId.get(cardId);
  return resource && "plainText" in resource ? (resource.plainText ?? "") : "";
}

function GridFrame({ scenario }: { scenario: Scenario }): JSX.Element {
  return (
    <div className="p-4">
      <OrganizerGrid
        model={scenario.model}
        resources={scenario.byId}
        getCardProps={(cardId) => ({
          showBody: true,
          body: bodyOf(scenario, cardId),
          onOpen: action("onOpen"),
          onSelect: action("onSelect"),
        })}
        label="Organizer grid by status and act"
      />
    </div>
  );
}

/** Story-local stand-in for the view's message line. */
function StateNote({
  children,
  isAlert = false,
}: {
  children: React.ReactNode;
  isAlert?: boolean;
}): JSX.Element {
  return (
    <p
      role={isAlert ? "alert" : "status"}
      className="p-4 text-sm text-gw-secondary"
    >
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Grid states
// ---------------------------------------------------------------------------

/** Two axes: Other values (Parked), None (the unsorted card) and a duplicate (The Crossing). */
export const TwoAxisGrid: Story = {
  render: () => <GridFrame scenario={buildScenario(SEEDS, null)} />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("grid")).toBeInTheDocument();
    await expect(
      canvas.getByRole("rowheader", { name: "Other values" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("rowheader", { name: "None" }),
    ).toBeInTheDocument();
    await expect(canvas.getAllByText("also in 1 other cell")).toHaveLength(2);
  },
};

/** No cards: every row and column still renders, with None last. */
export const EmptyGrid: Story = {
  render: () => <GridFrame scenario={buildScenario([], null)} />,
};

/** The source could not be read: a message and Retry, no grid and no other source. */
export const FailedSourceWithRetry: Story = {
  render: () => (
    <div>
      <StateNote isAlert>
        The smart folder could not be read: the search did not finish.
      </StateNote>
      <div className="px-4">
        <button
          type="button"
          className="min-h-11 px-3 rounded border border-gw-border bg-gw-chrome text-sm text-gw-primary"
          onClick={action("retry")}
        >
          Retry
        </button>
      </div>
    </div>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(canvas.queryByRole("grid")).toBeNull();
  },
};

/** The saved smart folder no longer exists. */
export const DeletedSource: Story = {
  render: () => (
    <StateNote>
      The smart folder this arrangement shows no longer exists. Choose another
      source.
    </StateNote>
  ),
};

/** Filters hide every card: distinct from an empty source. */
export const NoMatchForFilters: Story = {
  render: () => <StateNote>No cards match the current filters.</StateNote>,
};

/** An injected cap of 4 shows 4 of 6 cards and reports the rest in text. */
export const NotShownMessage: Story = {
  render: () => {
    const scenario = buildScenario(SEEDS, 4);
    return (
      <div>
        <StateNote>
          {scenario.model.notShownCount} not shown. Narrow the source or the
          filters to reach them.
        </StateNote>
        <GridFrame scenario={scenario} />
      </div>
    );
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expect(
      within(canvasElement).getByText(/2 not shown/),
    ).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Phone groups
// ---------------------------------------------------------------------------

/**
 * Phone groups, one list per row value. Story id
 * `workarea-organizergrid--phone-groups`; Task 39 loads it at 360px and 767px.
 */
export const PhoneGroups: Story = {
  render: () => {
    const scenario = buildScenario(SEEDS, null);
    return (
      <div className="p-2">
        <OrganizerPhoneGroups
          groups={buildOrganizerPhoneGroups(scenario.model)}
          resourcesById={Object.fromEntries(scenario.byId)}
          onSelect={action("onSelect")}
          onOpen={action("onOpen")}
        />
      </div>
    );
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("grid")).toBeNull();
    await expect(
      canvas.getAllByRole("button", { name: /^Open / }).length,
    ).toBeGreaterThan(0);
  },
};

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

const FIELD_CHOICES: OrganizerAxisChoice[] = [
  { axis: { kind: "status" }, label: "Status" },
  { axis: { kind: "subtype" }, label: "Subtype" },
  { axis: ACT_AXIS, label: "Act" },
];

const SMART_FOLDERS: OrganizerSmartFolderChoice[] = [
  { id: "q-revising", name: "Needs revising" },
  { id: "q-final", name: "Ready to compile" },
];

function ToolbarDemo(): JSX.Element {
  const [rows, setRows] = useState<OrganizerAxis>(STATUS_AXIS);
  const [columns, setColumns] = useState<OrganizerAxis>(ACT_AXIS);
  const [source, setSource] = useState<OrganizerSource>({
    kind: "folder",
    folderId: "folder-1",
    scope: "children",
  });
  return (
    <div className="p-4">
      <OrganizerGridToolbar
        fieldChoices={FIELD_CHOICES}
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        onColumnsChange={setColumns}
        source={source}
        folderId="folder-1"
        smartFolders={SMART_FOLDERS}
        onSourceChange={setSource}
      />
    </div>
  );
}

/** Source, Rows and Columns pickers; a field chosen for one axis leaves the other. */
export const Toolbar: Story = {
  render: () => <ToolbarDemo />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Rows")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Columns")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Source")).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Arrangement controls
// ---------------------------------------------------------------------------

const FOLDER_SOURCE: OrganizerSource = {
  kind: "folder",
  folderId: "folder-1",
  scope: "children",
};

const ARRANGEMENTS: OrganizerArrangement[] = [
  {
    id: "a-1",
    name: "Status by act",
    source: FOLDER_SOURCE,
    rows: STATUS_AXIS,
    columns: ACT_AXIS,
  },
  {
    id: "a-2",
    name: "Revision queue",
    source: { kind: "smart-folder", queryId: "q-gone" },
    rows: STATUS_AXIS,
    columns: "order",
  },
];

const AVAILABILITY: Record<string, OrganizerArrangementAvailability> = {
  "a-1": { status: "available" },
  "a-2": {
    status: "unavailable",
    reason: "query-missing",
    message: "The smart folder this arrangement shows no longer exists.",
  },
};

function ArrangementControlsDemo(): JSX.Element {
  const [list, setList] = useState<OrganizerArrangement[]>(ARRANGEMENTS);
  const [selectedId, setSelectedId] = useState<string | null>("a-1");
  return (
    <div className="p-4">
      <OrganizerArrangementControls
        arrangements={list}
        selectedId={selectedId}
        availability={AVAILABILITY}
        isChangedSinceApplied={false}
        onSelect={setSelectedId}
        onAdd={async (name) => {
          const id = `a-${list.length + 1}`;
          setList([
            ...list,
            {
              id,
              name,
              source: FOLDER_SOURCE,
              rows: STATUS_AXIS,
              columns: ACT_AXIS,
            },
          ]);
          return { ok: true, id };
        }}
        onRename={async (id, name) => {
          setList(list.map((a) => (a.id === id ? { ...a, name } : a)));
          return { ok: true, id };
        }}
        onDelete={async (id) => {
          setList(list.filter((a) => a.id !== id));
          return { ok: true, id };
        }}
      />
    </div>
  );
}

/** One arrangement is unavailable: its reason is shown in text and Apply is disabled. */
export const ArrangementControls: Story = {
  render: () => <ArrangementControlsDemo />,
};

// ---------------------------------------------------------------------------
// Whole toolbar (FR-19)
// ---------------------------------------------------------------------------

/** One arrangement stored with Columns "none", which the core no longer saves. */
const WHOLE_TOOLBAR_ARRANGEMENTS: OrganizerArrangement[] = [
  ...ARRANGEMENTS,
  {
    id: "a-3",
    name: "Old columns choice",
    source: FOLDER_SOURCE,
    rows: STATUS_AXIS,
    columns: "none",
  },
];

const WHOLE_TOOLBAR_AVAILABILITY: Record<
  string,
  OrganizerArrangementAvailability
> = {
  ...AVAILABILITY,
  "a-3": {
    status: "unavailable",
    reason: "axis-not-allowed",
    message:
      "This arrangement uses a Rows or Columns choice that cannot be applied.",
  },
};

function WholeToolbarDemo(): JSX.Element {
  const [rows, setRows] = useState<OrganizerAxis>("none");
  const [columns, setColumns] = useState<OrganizerAxis>("order");
  const [source, setSource] = useState<OrganizerSource>(FOLDER_SOURCE);
  const [list, setList] = useState<OrganizerArrangement[]>(
    WHOLE_TOOLBAR_ARRANGEMENTS,
  );
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const picks: UseOrganizerPicksResult = {
    effectiveSource: source,
    rowsAxis: rows,
    columnsAxis: columns,
    setRowsAxis: setRows,
    setColumnsAxis: setColumns,
    chooseSource: setSource,
    selectArrangement: (id) => {
      const target = list.find((a) => a.id === id);
      if (id === null) {
        setRows("none");
        setColumns("order");
        setSource(FOLDER_SOURCE);
        setAppliedId(null);
        setMessage(null);
      } else if (
        target &&
        WHOLE_TOOLBAR_AVAILABILITY[id]?.status !== "unavailable"
      ) {
        setRows(target.rows);
        setColumns(target.columns);
        setSource(target.source);
        setAppliedId(id);
        setMessage(null);
      } else {
        setMessage("This arrangement cannot be applied.");
      }
    },
    arrangementMessage: message,
    arrangements: {
      arrangements: list,
      appliedId,
      availability: WHOLE_TOOLBAR_AVAILABILITY,
      isChanged: false,
      notice: null,
      error: null,
      isBusy: false,
      apply: () => ({ ok: true }),
      save: async (name) => {
        const id = `a-${list.length + 1}`;
        setList([
          ...list,
          { id, name, source, rows, columns } as OrganizerArrangement,
        ]);
        return { ok: true, id };
      },
      rename: async (id, name) => {
        setList(list.map((a) => (a.id === id ? { ...a, name } : a)));
        return { ok: true, id };
      },
      remove: async (id) => {
        setList(list.filter((a) => a.id !== id));
        return { ok: true, id };
      },
    },
  };
  return (
    <div className="p-4 max-w-[360px] sm:max-w-none">
      <OrganizerToolbarArea
        picks={picks}
        folderId="folder-1"
        cards={[]}
        folderMetadataById={undefined}
      />
    </div>
  );
}

/**
 * The whole Organizer toolbar as the view lays it out: Rows and Columns
 * pickers, the source select and the arrangement controls. One saved
 * arrangement was stored with Columns "none"; it is listed as unavailable with
 * its reason in text and cannot be applied. Narrow the viewport to 360px to
 * check the touch layout.
 */
export const WholeToolbar: Story = {
  render: () => <WholeToolbarDemo />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Rows")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Columns")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Source")).toBeInTheDocument();
    await expect(
      canvasElement.querySelector("[data-organizer-arrangements]"),
    ).not.toBeNull();
  },
};
