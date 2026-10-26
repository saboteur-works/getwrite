/**
 * Unit tests for `entity-alias-refresh.ts`: both client copies of the alias
 * table are re-read after an entity's name set changes (task_2da52ad1),
 * including a rename of an entity resource, and a rename of a non-entity
 * resource reads neither.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
  getEntityAliasTableOrThrow: vi.fn(),
}));

import { makeStore } from "../../src/store/store";
import { setResources } from "../../src/store/resourcesSlice";
import {
  refreshEntityAliasTables,
  refreshEntityAliasTablesAfterRename,
} from "../../src/store/entity-alias-refresh";
import {
  getEntityAliasTable,
  getEntityAliasTableOrThrow,
} from "../../src/lib/api/entity-alias-table";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";

const mockedHighlighting = vi.mocked(getEntityAliasTable);
const mockedSpelling = vi.mocked(getEntityAliasTableOrThrow);

const TABLE: EntityAliasTable = {
  entities: {
    "res-entity": { name: "Aria", aliases: [], entityKind: "character" },
  },
  claimedBy: {},
} as unknown as EntityAliasTable;

function storeWith(resources: AnyResource[]) {
  const store = makeStore();
  store.dispatch(setResources(resources));
  return store;
}

function textResource(id: string, over: Partial<AnyResource> = {}) {
  const res = createTextResource({ name: "Aria" });
  (res as unknown as { id: string }).id = id;
  Object.assign(res, over);
  return res as AnyResource;
}

afterEach(() => {
  mockedHighlighting.mockReset();
  mockedSpelling.mockReset();
});

describe("refreshEntityAliasTables", () => {
  it("re-reads both the highlighting cache and the spell checker's copy", async () => {
    mockedHighlighting.mockResolvedValue(TABLE);
    mockedSpelling.mockResolvedValue(TABLE);
    const store = storeWith([]);

    store.dispatch(refreshEntityAliasTables("proj-dir"));

    await vi.waitFor(() => {
      expect(store.getState().entityAliasTable.status).toBe("succeeded");
      expect(store.getState().spelling.aliasTableStatus).toBe("loaded");
    });
    expect(mockedHighlighting).toHaveBeenCalledWith("proj-dir");
    expect(mockedSpelling).toHaveBeenCalledWith("proj-dir");
    expect(store.getState().spelling.aliasTable).toEqual(TABLE);
  });
});

describe("refreshEntityAliasTablesAfterRename", () => {
  it("re-reads both copies when the renamed resource is an entity", async () => {
    mockedHighlighting.mockResolvedValue(TABLE);
    mockedSpelling.mockResolvedValue(TABLE);
    const store = storeWith([
      textResource("res-entity", { entityKind: "character" }),
    ]);

    store.dispatch(
      refreshEntityAliasTablesAfterRename("proj-dir", "res-entity"),
    );

    await vi.waitFor(() => {
      expect(mockedHighlighting).toHaveBeenCalledWith("proj-dir");
      expect(mockedSpelling).toHaveBeenCalledWith("proj-dir");
    });
  });

  it("reads neither copy when the renamed resource is not an entity", async () => {
    const store = storeWith([textResource("res-plain")]);

    store.dispatch(
      refreshEntityAliasTablesAfterRename("proj-dir", "res-plain"),
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(mockedHighlighting).not.toHaveBeenCalled();
    expect(mockedSpelling).not.toHaveBeenCalled();
  });
});
