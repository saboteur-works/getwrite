import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import EntityRelationshipsSection from "../../components/Sidebar/EntityRelationshipsSection";
import EntityRelationshipsRefreshProvider, {
  useEntityRelationshipsRefresh,
} from "../../components/Sidebar/EntityRelationshipsRefreshContext";
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

import { listEntityRelationships } from "../../src/lib/api/entity-relationships";
import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";

const mockedList = vi.mocked(listEntityRelationships);
const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);

const PROJECT_ID = "proj-relationships-refresh-1";

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
  },
  claimedBy: {},
};

async function setupStore() {
  mockedGetEntityAliasTable.mockResolvedValue(ALIAS_TABLE);

  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Test Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      relationshipTypes: ["ally of"],
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));

  const res = createTextResource({ name: "Aria" });
  (res as unknown as { id: string }).id = "entity-aria";
  Object.assign(res, { entityKind: "character" });
  store.dispatch(setResources([res] as AnyResource[]));
  store.dispatch(setSelectedResourceId("entity-aria"));

  await store.dispatch(fetchEntityAliasTable(PROJECT_ID) as never);

  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
  mockedList.mockReset();
  mockedGetEntityAliasTable.mockReset();
});

/**
 * A minimal consumer that exposes the shared `notifyRelationshipsChanged`
 * trigger as a button, standing in for whatever mutation flow (e.g. entity
 * removal, Task 7) eventually calls it.
 */
function NotifyButton(): JSX.Element {
  const { notifyRelationshipsChanged } = useEntityRelationshipsRefresh();
  return (
    <button
      aria-label="notify-relationships-changed"
      onClick={() => notifyRelationshipsChanged()}
    >
      Notify
    </button>
  );
}

describe("EntityRelationshipsRefreshContext", () => {
  it("throws when useEntityRelationshipsRefresh is used outside the provider", () => {
    function Consumer(): JSX.Element {
      useEntityRelationshipsRefresh();
      return <></>;
    }
    // Silence the expected React error-boundary console output.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      "useEntityRelationshipsRefresh must be used within an EntityRelationshipsRefreshProvider",
    );
    spy.mockRestore();
  });

  it("re-runs EntityRelationshipsSection's fetch when a sibling consumer calls notifyRelationshipsChanged, without a remount or a projectId change", async () => {
    mockedList.mockResolvedValue([]);
    const store = await setupStore();

    render(
      <Provider store={store}>
        <EntityRelationshipsRefreshProvider>
          <NotifyButton />
          <EntityRelationshipsSection />
        </EntityRelationshipsRefreshProvider>
      </Provider>,
    );

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));
    expect(mockedList).toHaveBeenCalledWith(PROJECT_ID);

    const notifyButton = screen.getByLabelText("notify-relationships-changed");
    notifyButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    expect(mockedList).toHaveBeenLastCalledWith(PROJECT_ID);
  });
});
