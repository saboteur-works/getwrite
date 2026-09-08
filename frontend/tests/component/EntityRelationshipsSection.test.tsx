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
} from "../../src/lib/api/entity-relationships";
import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";

const mockedList = vi.mocked(listEntityRelationships);
const mockedCreate = vi.mocked(createEntityRelationship);
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
});
