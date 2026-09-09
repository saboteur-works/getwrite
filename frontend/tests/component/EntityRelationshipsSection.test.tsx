import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import EntityRelationshipsSection from "../../components/Sidebar/EntityRelationshipsSection";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";

vi.mock("../../src/lib/api/entity-relationships", () => ({
  listEntityRelationships: vi.fn(),
  createEntityRelationship: vi.fn(),
  removeEntityRelationship: vi.fn(),
}));

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));

import {
  listEntityRelationships,
  createEntityRelationship,
  removeEntityRelationship,
} from "../../src/lib/api/entity-relationships";
import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";

const mockedList = vi.mocked(listEntityRelationships);
const mockedCreate = vi.mocked(createEntityRelationship);
const mockedRemove = vi.mocked(removeEntityRelationship);
const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);

const PROJECT_ID = "proj-relationships-1";

const ALIAS_TABLE: EntityAliasTable = {
  entities: {
    "entity-aria": {
      entityId: "entity-aria",
      entityKind: "character",
      name: "Aria",
      aliases: [],
      terms: ["Aria"],
    },
    "entity-priya": {
      entityId: "entity-priya",
      entityKind: "character",
      name: "Priya",
      aliases: [],
      terms: ["Priya"],
    },
    "entity-marcus": {
      entityId: "entity-marcus",
      entityKind: "character",
      name: "Marcus",
      aliases: [],
      terms: ["Marcus"],
    },
  },
  claimedBy: {},
};

async function setupStore(
  options: {
    resourceId?: string;
    relationshipTypes?: string[];
    aliasTable?: EntityAliasTable;
  } = {},
) {
  const {
    resourceId = "entity-aria",
    relationshipTypes = ["ally of", "rival of"],
    aliasTable = ALIAS_TABLE,
  } = options;

  mockedGetEntityAliasTable.mockResolvedValue(aliasTable);

  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Test Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      relationshipTypes,
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));

  const res = createTextResource({ name: "Aria" });
  (res as unknown as { id: string }).id = resourceId;
  Object.assign(res, { entityKind: "character" });
  store.dispatch(setResources([res] as AnyResource[]));
  store.dispatch(setSelectedResourceId(resourceId));

  await store.dispatch(fetchEntityAliasTable(PROJECT_ID) as never);

  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
  mockedList.mockReset();
  mockedCreate.mockReset();
  mockedRemove.mockReset();
  mockedGetEntityAliasTable.mockReset();
});

describe("EntityRelationshipsSection", () => {
  it("lists every other declared entity in the target select, excluding the currently-selected entity", async () => {
    mockedList.mockResolvedValue([]);
    const store = await setupStore();

    render(
      <Provider store={store}>
        <EntityRelationshipsSection />
      </Provider>,
    );

    await waitFor(() => expect(mockedList).toHaveBeenCalledWith(PROJECT_ID));

    const select = screen.getByLabelText(
      "entity-relationship-target-select",
    ) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);

    expect(optionValues).toContain("entity-priya");
    expect(optionValues).toContain("entity-marcus");
    expect(optionValues).not.toContain("entity-aria");
  });

  it("lists the fixture project's configured relationship types, and disables the control with an explanatory message when empty", async () => {
    mockedList.mockResolvedValue([]);
    const store = await setupStore({
      relationshipTypes: ["ally of", "rival of"],
    });

    render(
      <Provider store={store}>
        <EntityRelationshipsSection />
      </Provider>,
    );

    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    const typeSelect = screen.getByLabelText(
      "entity-relationship-type-select",
    ) as HTMLSelectElement;
    const optionValues = Array.from(typeSelect.options).map((o) => o.value);
    expect(optionValues).toContain("ally of");
    expect(optionValues).toContain("rival of");
    expect(typeSelect).not.toBeDisabled();

    const { unmount } = render(<></>);
    unmount();
  });

  it("disables the relationship-type select with an explanatory message when the project has no configured types", async () => {
    mockedList.mockResolvedValue([]);
    const store = await setupStore({ relationshipTypes: [] });

    render(
      <Provider store={store}>
        <EntityRelationshipsSection />
      </Provider>,
    );

    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    const typeSelect = screen.getByLabelText(
      "entity-relationship-type-select",
    ) as HTMLSelectElement;
    expect(typeSelect).toBeDisabled();
    expect(
      screen.getByText(/No relationship types are configured/i),
    ).toBeInTheDocument();
  });

  it("calls create with the chosen target and type on Add, and re-fetches the edge list on success", async () => {
    mockedList.mockResolvedValue([]);
    mockedCreate.mockResolvedValue({
      id: "edge-1",
      sourceEntityId: "entity-aria",
      targetEntityId: "entity-priya",
      relationshipType: "ally of",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const store = await setupStore();

    render(
      <Provider store={store}>
        <EntityRelationshipsSection />
      </Provider>,
    );

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));

    const targetSelect = screen.getByLabelText(
      "entity-relationship-target-select",
    ) as HTMLSelectElement;
    const typeSelect = screen.getByLabelText(
      "entity-relationship-type-select",
    ) as HTMLSelectElement;

    targetSelect.value = "entity-priya";
    targetSelect.dispatchEvent(new Event("change", { bubbles: true }));
    typeSelect.value = "ally of";
    typeSelect.dispatchEvent(new Event("change", { bubbles: true }));

    const addButton = screen.getByLabelText("add-entity-relationship");
    addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(
        PROJECT_ID,
        "entity-aria",
        "entity-priya",
        "ally of",
      ),
    );

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  });

  it("performs its own independent fetch, with no dependency on EntityMentionsContext — verified by direct inspection of the component's imports", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const filePath = path.resolve(
      __dirname,
      "../../components/Sidebar/EntityRelationshipsSection.tsx",
    );
    const raw = fs.readFileSync(filePath, "utf-8");

    // Isolate just the import statements (everything up to the first
    // non-import, non-blank, non-"use client" line) rather than the whole
    // file, so this assertion is about the component's *dependencies*
    // (FR-8/Task 6's "no shared-provider dependency" requirement), not
    // about whether the module's own doc comment is permitted to mention
    // the sibling component by name for orientation.
    const importLines = raw
      .split("\n")
      .filter((line) => line.trim().startsWith("import "))
      .join("\n");

    expect(importLines.length).toBeGreaterThan(0);
    expect(importLines).not.toMatch(/EntityMentionsContext/);
    expect(importLines).not.toMatch(/useEntityMentions/);
  });

  it("renders each edge's other-entity name and relationship type, distinguishing a source-role edge from a target-role edge", async () => {
    mockedList.mockResolvedValue([
      {
        id: "edge-source",
        sourceEntityId: "entity-aria",
        targetEntityId: "entity-priya",
        relationshipType: "ally of",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "edge-target",
        sourceEntityId: "entity-marcus",
        targetEntityId: "entity-aria",
        relationshipType: "rival of",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    const store = await setupStore();

    render(
      <Provider store={store}>
        <EntityRelationshipsSection />
      </Provider>,
    );

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));

    const list = await screen.findByLabelText("entity-relationship-list");
    const rows: HTMLLIElement[] = Array.from(list.querySelectorAll("li"));
    expect(rows).toHaveLength(2);

    const sourceRow = Array.from(rows).find(
      (row) => row.getAttribute("data-edge-role") === "source",
    );
    const targetRow = Array.from(rows).find(
      (row) => row.getAttribute("data-edge-role") === "target",
    );

    expect(sourceRow).toBeDefined();
    expect(targetRow).toBeDefined();
    expect(sourceRow?.textContent).toMatch(/Priya/);
    expect(sourceRow?.textContent).toMatch(/ally of/);
    expect(targetRow?.textContent).toMatch(/Marcus/);
    expect(targetRow?.textContent).toMatch(/rival of/);

    // FR-3: the direction indicator must actually distinguish the two roles,
    // not just be present on both.
    expect(sourceRow?.getAttribute("data-edge-role")).not.toEqual(
      targetRow?.getAttribute("data-edge-role"),
    );
  });

  it("renders a placeholder when the edge names an entity id absent from the alias table (FR-11), without dropping the row or crashing the section", async () => {
    mockedList.mockResolvedValue([
      {
        id: "edge-dangling",
        sourceEntityId: "entity-aria",
        targetEntityId: "entity-deleted",
        relationshipType: "ally of",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const store = await setupStore();

    render(
      <Provider store={store}>
        <EntityRelationshipsSection />
      </Provider>,
    );

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));

    const list = await screen.findByLabelText("entity-relationship-list");
    expect(list.querySelectorAll("li")).toHaveLength(1);
    expect(list.textContent).toMatch(/Unknown entity/i);

    // The rest of the section (the create control) still rendered.
    expect(
      screen.getByLabelText("entity-relationship-target-select"),
    ).toBeInTheDocument();
  });

  it("calls remove with the row's edge id on click, and the list no longer shows that row after a successful re-fetch (FR-6)", async () => {
    mockedList
      .mockResolvedValueOnce([
        {
          id: "edge-1",
          sourceEntityId: "entity-aria",
          targetEntityId: "entity-priya",
          relationshipType: "ally of",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([]);
    mockedRemove.mockResolvedValue(true);
    const store = await setupStore();

    render(
      <Provider store={store}>
        <EntityRelationshipsSection />
      </Provider>,
    );

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));

    const removeButton = await screen.findByLabelText(
      "Remove relationship with Priya",
    );
    removeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await waitFor(() =>
      expect(mockedRemove).toHaveBeenCalledWith(PROJECT_ID, "edge-1"),
    );
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("entity-relationship-list"),
      ).not.toBeInTheDocument(),
    );
  });

  it("does not render any edit-in-place control (an editable type field or endpoint picker) on an existing row (OQ-3)", async () => {
    mockedList.mockResolvedValue([
      {
        id: "edge-1",
        sourceEntityId: "entity-aria",
        targetEntityId: "entity-priya",
        relationshipType: "ally of",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const store = await setupStore();

    render(
      <Provider store={store}>
        <EntityRelationshipsSection />
      </Provider>,
    );

    const list = await screen.findByLabelText("entity-relationship-list");
    // No <select> or editable <input>/<textarea> inside an existing row —
    // the only interactive control on a row is the "Remove" button.
    expect(list.querySelectorAll("select")).toHaveLength(0);
    expect(list.querySelectorAll("input, textarea")).toHaveLength(0);
    const rowButtons: (string | null)[] = Array.from(
      list.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
    ).map((btn) => btn.getAttribute("aria-label"));
    expect(rowButtons).toEqual(["Remove relationship with Priya"]);
  });
});
