/**
 * Feature 69, Task 11: end-to-end verification that the kind-encoding half
 * of the feature (FR-1-10) is coherent across all three disclosure channels
 * — the customization modal's own legend, `EntityGraphCanvas`'s rendered
 * node, and `EntityGraphAccessibleList`'s text — and that a style saved
 * through `EntityKindStylesModal` reaches the canvas with no reload
 * (FR-4).
 *
 * This mirrors `EntityRelationshipGraphView.test.tsx`'s mocking setup (the
 * alias table, co-occurrence, relationships, tags, and position transports
 * are mocked at the module boundary so no real `fetch` is attempted) but
 * drives the one scenario that file's own "re-fetches kind styles after a
 * save" test does not: that after the save-triggered re-fetch, the canvas's
 * actually-rendered SVG node for that entity's kind shows the new
 * color/shape, matching what the legend displays, with the accessible
 * list's kind-name text staying in agreement throughout (FR-8 only requires
 * that list to disclose the raw `entityKind` string, not its color/shape
 * mapping — see `EntityGraphAccessibleList.tsx`'s own doc comment).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import EntityRelationshipGraphView from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";
import { getEntityKindShapeGeometry } from "../../components/WorkArea/Views/EntityRelationshipGraphView/entityKindShapes";

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-cooccurrence", () => ({
  getEntityCooccurrence: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-relationships", () => ({
  listEntityRelationships: vi.fn(),
  createEntityRelationship: vi.fn(),
  removeEntityRelationship: vi.fn(),
}));
vi.mock("../../src/lib/api/resources", () => ({ updateSidecar: vi.fn() }));
vi.mock("../../src/lib/api/tags", () => ({ listTags: vi.fn() }));
vi.mock("../../src/lib/api/entity-graph-positions", () => ({
  getEntityGraphPositions: vi.fn(),
  saveEntityGraphPosition: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-graph-kind-styles", () => ({
  getEntityGraphKindStyles: vi.fn(),
  saveEntityGraphKindStyle: vi.fn(),
}));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";
import { getEntityCooccurrence } from "../../src/lib/api/entity-cooccurrence";
import { listEntityRelationships } from "../../src/lib/api/entity-relationships";
import { listTags } from "../../src/lib/api/tags";
import { getEntityGraphPositions } from "../../src/lib/api/entity-graph-positions";
import {
  getEntityGraphKindStyles,
  saveEntityGraphKindStyle,
} from "../../src/lib/api/entity-graph-kind-styles";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetEntityCooccurrence = vi.mocked(getEntityCooccurrence);
const mockedListEntityRelationships = vi.mocked(listEntityRelationships);
const mockedListTags = vi.mocked(listTags);
const mockedGetEntityGraphPositions = vi.mocked(getEntityGraphPositions);
const mockedGetEntityGraphKindStyles = vi.mocked(getEntityGraphKindStyles);
const mockedSaveEntityGraphKindStyle = vi.mocked(saveEntityGraphKindStyle);

const PROJECT_ID = "proj-entity-graph-kind-e2e";

const aliasTable: EntityAliasTable = {
  entities: {
    "e-anna": {
      entityId: "e-anna",
      entityKind: "character",
      name: "Anna",
      aliases: [],
      terms: ["Anna"],
    },
  },
  claimedBy: {},
};

async function setupStore() {
  mockedGetEntityAliasTable.mockResolvedValue(aliasTable);
  mockedListTags.mockResolvedValue([]);
  mockedGetEntityCooccurrence.mockResolvedValue({});
  mockedListEntityRelationships.mockResolvedValue([]);
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Entity Graph Kind Encoding Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      folders: [],
      resources: [],
      features: { entities: true },
    } as never),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  await store.dispatch(fetchEntityAliasTable(PROJECT_ID));
  return store;
}

beforeEach(() => {
  mockedGetEntityGraphPositions.mockReset();
  mockedGetEntityGraphPositions.mockResolvedValue([]);
  mockedGetEntityGraphKindStyles.mockReset();
  mockedSaveEntityGraphKindStyle.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Feature 69 Task 11: cross-channel kind-encoding consistency", () => {
  it("a style saved via the modal reaches the canvas's rendered node and agrees with the legend, with no reload", async () => {
    // Initially unconfigured: the canvas falls back to Task 5's deterministic
    // style, and the modal shows "character" in its new/unmapped section.
    mockedGetEntityGraphKindStyles.mockResolvedValue([]);

    const store = await setupStore();
    render(
      <Provider store={store}>
        <EntityRelationshipGraphView />
      </Provider>,
    );

    const nodeGroup = await screen.findByTestId("entity-graph-node", {
      selector: '[data-entity-id="e-anna"]',
    });
    expect(nodeGroup).toBeInTheDocument();

    // Open the modal; its own `loadStyles` effect re-fetches (still `[]`).
    const openButton = await screen.findByTestId(
      "entity-kind-styles-open-button",
    );
    fireEvent.click(openButton);

    const unmappedRow = await screen.findByTestId(
      "unmapped-kind-row-character",
    );
    expect(within(unmappedRow).getByText("character")).toBeInTheDocument();

    // Choose a distinctive, non-default color+shape and save it.
    const colorSelect = within(unmappedRow).getByLabelText("character color");
    fireEvent.change(colorSelect, { target: { value: "entity-kind-5" } });
    const shapeSelect = within(unmappedRow).getByLabelText("character shape");
    fireEvent.change(shapeSelect, { target: { value: "star" } });

    mockedSaveEntityGraphKindStyle.mockResolvedValue({
      entityKind: "character",
      color: "entity-kind-5",
      shape: "star",
    });
    // The view's `refetchKindStyles` (triggered by the modal's
    // `onStylesChanged`) re-reads the full list; by then the kind is
    // configured.
    mockedGetEntityGraphKindStyles.mockResolvedValue([
      { entityKind: "character", color: "entity-kind-5", shape: "star" },
    ]);

    fireEvent.click(within(unmappedRow).getByText("Save style"));

    // (i) The modal's own legend reflects the new mapping.
    const legendRow = await screen.findByTestId(
      "entity-kind-styles-legend-row-character",
    );
    expect(within(legendRow).getByText("Color 6, Star")).toBeInTheDocument();

    // Close the modal so only the canvas/list remain to inspect.
    fireEvent.click(screen.getByText("Close"));

    // (ii) The canvas's own rendered node — found independently of the
    // modal/legend — now draws the star shape filled from the
    // `--entity-kind-5` token, with no reload: this is the same
    // `graphData`/`kindStyles` re-render path, not a remount.
    await waitFor(() => {
      const path = nodeGroup.querySelector("path");
      expect(path).not.toBeNull();
      expect(path?.getAttribute("style")).toContain(
        "fill: var(--entity-kind-5)",
      );
    });
    const expectedStarGeometry = getEntityKindShapeGeometry("star", 22);
    expect(expectedStarGeometry.kind).toBe("path");
    const path = nodeGroup.querySelector("path");
    if (expectedStarGeometry.kind === "path") {
      expect(path?.getAttribute("d")).toBe(expectedStarGeometry.d);
    }

    // (iii) The accessible list discloses the identical `entityKind` string
    // the legend and canvas tooltip are keyed by — FR-8 only requires the
    // raw kind name as text, not its color/shape mapping, so "agreement"
    // here means no name drift between the two surfaces, not a duplicated
    // color/shape disclosure.
    const accessibleList = screen.getByTestId("entity-graph-accessible-list");
    expect(
      within(accessibleList).getByTestId("entity-graph-node-kind"),
    ).toHaveTextContent("Kind: character");
  });
});
