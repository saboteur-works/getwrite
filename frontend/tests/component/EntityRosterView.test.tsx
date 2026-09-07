/**
 * Component tests for `EntityRosterView` (entity-roster Task 6) — the
 * roster's data assembly: reading the cached `EntityAliasTable`
 * (`entityAliasTableSlice`), fetching mention counts
 * (`getEntityMentionCounts`), alphabetical ordering (FR-4), zero-mention
 * distinction (FR-5), the shared "needs attention" state (FR-7/FR-9), and
 * the FR-11 empty state.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import EntityRosterView from "../../components/WorkArea/Views/EntityRosterView/EntityRosterView";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-mention-counts", () => ({
  getEntityMentionCounts: vi.fn(),
}));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";
import { getEntityMentionCounts } from "../../src/lib/api/entity-mention-counts";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetEntityMentionCounts = vi.mocked(getEntityMentionCounts);

const PROJECT_ID = "proj-entity-roster";

/**
 * Builds a store with the given alias table cached and the given project's
 * directory basename set (matching `selectActiveProjectDirectoryId`'s
 * `rootPath`-derived read), and given `entities` feature flag.
 */
async function setupStore(
  aliasTable: EntityAliasTable,
  entitiesEnabled = true,
) {
  mockedGetEntityAliasTable.mockResolvedValue(aliasTable);
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Entity Roster Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      folders: [],
      resources: [],
      features: { entities: entitiesEnabled },
    } as never),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  await store.dispatch(fetchEntityAliasTable(PROJECT_ID));
  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EntityRosterView", () => {
  it("renders entities alphabetically by name regardless of input/counts order (FR-4)", async () => {
    const table: EntityAliasTable = {
      entities: {
        "e-zed": {
          entityId: "e-zed",
          entityKind: "character",
          name: "Zedd",
          aliases: [],
          terms: ["Zedd"],
        },
        "e-anna": {
          entityId: "e-anna",
          entityKind: "character",
          name: "anna",
          aliases: [],
          terms: ["anna"],
        },
        "e-mike": {
          entityId: "e-mike",
          entityKind: "place",
          name: "Mikeburg",
          aliases: [],
          terms: ["Mikeburg"],
        },
      },
      claimedBy: {},
    };
    mockedGetEntityMentionCounts.mockResolvedValue({ "e-zed": 2, "e-mike": 5 });

    const store = await setupStore(table);

    render(
      <Provider store={store}>
        <EntityRosterView />
      </Provider>,
    );

    await waitFor(() =>
      expect(mockedGetEntityMentionCounts).toHaveBeenCalledWith(PROJECT_ID),
    );

    const names = await screen.findAllByTestId("entity-roster-row-name");
    expect(names.map((el: HTMLElement) => el.textContent)).toEqual([
      "anna",
      "Mikeburg",
      "Zedd",
    ]);
  });

  it("treats a missing mention-count entry the same as an explicit zero, distinguished from nonzero (FR-5)", async () => {
    const table: EntityAliasTable = {
      entities: {
        "e-absent": {
          entityId: "e-absent",
          entityKind: "character",
          name: "Absent Entity",
          aliases: [],
          terms: ["Absent Entity"],
        },
        "e-zero": {
          entityId: "e-zero",
          entityKind: "character",
          name: "Zero Entity",
          aliases: [],
          terms: ["Zero Entity"],
        },
        "e-nonzero": {
          entityId: "e-nonzero",
          entityKind: "character",
          name: "Nonzero Entity",
          aliases: [],
          terms: ["Nonzero Entity"],
        },
      },
      claimedBy: {},
    };
    // "e-absent" is intentionally omitted; "e-zero" is explicit 0.
    mockedGetEntityMentionCounts.mockResolvedValue({
      "e-zero": 0,
      "e-nonzero": 3,
    });

    const store = await setupStore(table);

    render(
      <Provider store={store}>
        <EntityRosterView />
      </Provider>,
    );

    await waitFor(() =>
      expect(mockedGetEntityMentionCounts).toHaveBeenCalled(),
    );

    const counts = await screen.findAllByTestId(
      "entity-roster-row-mention-count",
    );
    const byName: Record<string, HTMLElement> = {};
    const names = screen.getAllByTestId("entity-roster-row-name");
    names.forEach((el: HTMLElement, i: number) => {
      byName[el.textContent ?? ""] = counts[i];
    });

    expect(byName["Absent Entity"].getAttribute("data-zero-mentions")).toBe(
      "true",
    );
    expect(byName["Zero Entity"].getAttribute("data-zero-mentions")).toBe(
      "true",
    );
    expect(byName["Absent Entity"].textContent).toBe(
      byName["Zero Entity"].textContent,
    );
    expect(byName["Nonzero Entity"].getAttribute("data-zero-mentions")).toBe(
      "false",
    );
    // Not merely a "0" string — a distinguishing label instead.
    expect(byName["Absent Entity"].textContent).not.toBe("0");
    expect(byName["Nonzero Entity"].textContent).not.toBe(
      byName["Absent Entity"].textContent,
    );
  });

  it("surfaces a claimedBy ambiguity and a getAliasWarning-flagged alias both as one shared needs-attention state (FR-7/FR-9)", async () => {
    const table: EntityAliasTable = {
      entities: {
        "e-ambiguous": {
          entityId: "e-ambiguous",
          entityKind: "character",
          name: "Ambiguous One",
          aliases: [],
          terms: ["Ambiguous One"],
        },
        "e-noisy": {
          entityId: "e-noisy",
          entityKind: "character",
          name: "Noisy Two",
          // "May" is on the fixed common-word list in
          // entity-alias-warnings.ts.
          aliases: ["May"],
          terms: ["Noisy Two", "May"],
        },
        "e-clean": {
          entityId: "e-clean",
          entityKind: "character",
          name: "Clean Three",
          aliases: ["Cleanie"],
          terms: ["Clean Three", "Cleanie"],
        },
      },
      claimedBy: { "ambiguous one": ["e-ambiguous", "some-other-entity"] },
    };
    mockedGetEntityMentionCounts.mockResolvedValue({});

    const store = await setupStore(table);

    render(
      <Provider store={store}>
        <EntityRosterView />
      </Provider>,
    );

    await waitFor(() =>
      expect(mockedGetEntityMentionCounts).toHaveBeenCalled(),
    );

    const names = await screen.findAllByTestId("entity-roster-row-name");
    const flags = screen.getAllByTestId("entity-roster-row-needs-attention");
    const byName: Record<string, HTMLElement> = {};
    names.forEach((el: HTMLElement, i: number) => {
      byName[el.textContent ?? ""] = flags[i];
    });

    expect(byName["Ambiguous One"].getAttribute("data-needs-attention")).toBe(
      "true",
    );
    expect(byName["Ambiguous One"].getAttribute("data-ambiguous")).toBe("true");
    expect(byName["Ambiguous One"].getAttribute("data-noise-prone")).toBe(
      "false",
    );

    expect(byName["Noisy Two"].getAttribute("data-needs-attention")).toBe(
      "true",
    );
    expect(byName["Noisy Two"].getAttribute("data-ambiguous")).toBe("false");
    expect(byName["Noisy Two"].getAttribute("data-noise-prone")).toBe("true");

    expect(byName["Clean Three"].getAttribute("data-needs-attention")).toBe(
      "false",
    );

    // Exactly one shared visual/text signal per row, not two independent
    // ones — both flagged rows render identical needs-attention text.
    expect(byName["Ambiguous One"].textContent).toBe(
      byName["Noisy Two"].textContent,
    );
  });

  it("renders the FR-11 empty state when entities is on but no entity is declared", async () => {
    mockedGetEntityMentionCounts.mockResolvedValue({});
    const store = await setupStore({ entities: {}, claimedBy: {} }, true);

    render(
      <Provider store={store}>
        <EntityRosterView />
      </Provider>,
    );

    expect(await screen.findByTestId("entity-roster-empty-state")).toBeTruthy();
    expect(
      screen.getByText(/no entities have been declared yet/i),
    ).toBeTruthy();
    expect(screen.queryByTestId("entity-roster-list")).toBeNull();
  });
});
