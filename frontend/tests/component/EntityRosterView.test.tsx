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
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import EntityRosterView from "../../components/WorkArea/Views/EntityRosterView/EntityRosterView";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";
import type { AnyResource } from "../../src/lib/models/types";

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-mention-counts", () => ({
  getEntityMentionCounts: vi.fn(),
}));
vi.mock("../../src/lib/api/resources", () => ({ updateSidecar: vi.fn() }));
vi.mock("../../src/lib/api/project-noise-words", () => ({
  getNoiseWordLists: vi.fn(),
}));
vi.mock("../../src/lib/api/global-noise-words", () => ({
  getGlobalNoiseWords: vi.fn(),
}));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";
import { getEntityMentionCounts } from "../../src/lib/api/entity-mention-counts";
import { updateSidecar } from "../../src/lib/api/resources";
import { getNoiseWordLists } from "../../src/lib/api/project-noise-words";
import { getGlobalNoiseWords } from "../../src/lib/api/global-noise-words";

const mockedUpdateSidecar = vi.mocked(updateSidecar);

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetEntityMentionCounts = vi.mocked(getEntityMentionCounts);
const mockedGetNoiseWordLists = vi.mocked(getNoiseWordLists);
const mockedGetGlobalNoiseWords = vi.mocked(getGlobalNoiseWords);

const PROJECT_ID = "proj-entity-roster";

/** Minimal valid `AnyResource` (text resource) for an entity, used to seed
 * `resourcesSlice` with a `dismissedNoiseTerms` value for a given id. */
function makeEntityResource(
  id: string,
  overrides: Partial<AnyResource> = {},
): AnyResource {
  return {
    id,
    name: id,
    type: "text",
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as AnyResource;
}

/**
 * Builds a store with the given alias table cached and the given project's
 * directory basename set (matching `selectActiveProjectDirectoryId`'s
 * `rootPath`-derived read), and given `entities` feature flag. Also seeds
 * `resourcesSlice` with `resources` (defaulting to `[]`) so dismissal
 * lookups by entity id resolve.
 */
async function setupStore(
  aliasTable: EntityAliasTable,
  entitiesEnabled = true,
  resources: AnyResource[] = [],
) {
  mockedGetEntityAliasTable.mockResolvedValue(aliasTable);
  mockedGetNoiseWordLists.mockResolvedValue({
    customNoiseWords: [],
    excludedGlobalNoiseWords: [],
  });
  mockedGetGlobalNoiseWords.mockResolvedValue([]);
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
  store.dispatch(setResources(resources));
  await store.dispatch(fetchEntityAliasTable(PROJECT_ID));
  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
  // `vi.restoreAllMocks()` restores `vi.spyOn` implementations but does not
  // clear call history for the plain `vi.fn()` mocks created by the
  // `vi.mock(...)` factories above (e.g. `mockedUpdateSidecar`) — without
  // this, a dismissal test's `updateSidecar` call leaks into a later test's
  // "never calls updateSidecar" assertion.
  vi.clearAllMocks();
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
    mockedGetEntityMentionCounts.mockResolvedValue({
      "e-zed": { mentions: 2, resources: 1 },
      "e-mike": { mentions: 5, resources: 2 },
    });

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
      "e-zero": { mentions: 0, resources: 0 },
      "e-nonzero": { mentions: 3, resources: 1 },
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

  it("surfaces a claimedBy ambiguity and a checkNoiseFlag-flagged alias both as one shared needs-attention state (FR-7/FR-9)", async () => {
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
          // entity-noise-check.ts.
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

  it("flags a noisy NAME the same way a noisy alias is flagged (FR-1)", async () => {
    const table: EntityAliasTable = {
      entities: {
        "e-noisy-name": {
          entityId: "e-noisy-name",
          entityKind: "character",
          // "May" is on the bundled common-word list in
          // entity-noise-check.ts — same term used elsewhere in this file
          // to flag an alias, here used as the entity's own `name`.
          name: "May",
          aliases: [],
          terms: ["May"],
        },
        "e-clean-name": {
          entityId: "e-clean-name",
          entityKind: "character",
          name: "Zedrathorn",
          aliases: [],
          terms: ["Zedrathorn"],
        },
      },
      claimedBy: {},
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

    expect(byName["May"].getAttribute("data-noise-prone")).toBe("true");
    expect(byName["May"].getAttribute("data-needs-attention")).toBe("true");
    expect(byName["Zedrathorn"].getAttribute("data-noise-prone")).toBe("false");

    // The flagged name's observation and dismiss control render inline.
    expect(
      screen.getByText(/"May" also reads as a common English word/i),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Dismiss noise observation/i }),
    ).toBeTruthy();
  });

  it("scopes dismissal per-entity-per-term: dismissing a term on one entity does not suppress it on another (FR-13)", async () => {
    const table: EntityAliasTable = {
      entities: {
        "e-a": {
          entityId: "e-a",
          entityKind: "character",
          name: "Entity A",
          aliases: ["Case"],
          terms: ["Entity A", "Case"],
        },
        "e-b": {
          entityId: "e-b",
          entityKind: "character",
          name: "Entity B",
          aliases: ["Case"],
          terms: ["Entity B", "Case"],
        },
      },
      claimedBy: {},
    };
    mockedGetEntityMentionCounts.mockResolvedValue({});
    mockedUpdateSidecar.mockResolvedValue(undefined);

    const resources: AnyResource[] = [
      makeEntityResource("e-a", {
        name: "Entity A",
        entityKind: "character",
        aliases: ["Case"],
      }),
      makeEntityResource("e-b", {
        name: "Entity B",
        entityKind: "character",
        aliases: ["Case"],
      }),
    ];

    const store = await setupStore(table, true, resources);

    render(
      <Provider store={store}>
        <EntityRosterView />
      </Provider>,
    );

    await waitFor(() =>
      expect(mockedGetEntityMentionCounts).toHaveBeenCalled(),
    );

    // Both entities start out flagged for "Case".
    const dismissButtonsBefore = await screen.findAllByRole("button", {
      name: /Dismiss noise observation for "Case"/i,
    });
    expect(dismissButtonsBefore).toHaveLength(2);

    // Dismiss "Case" on Entity A only.
    dismissButtonsBefore[0].click();

    await waitFor(() => expect(mockedUpdateSidecar).toHaveBeenCalledTimes(1));
    expect(mockedUpdateSidecar).toHaveBeenCalledWith(
      "e-a",
      PROJECT_ID,
      expect.objectContaining({ dismissedNoiseTerms: ["case"] }),
    );

    // Entity A's observation disappears; Entity B's remains.
    await waitFor(() => {
      const remaining = screen.getAllByRole("button", {
        name: /Dismiss noise observation for "Case"/i,
      });
      expect(remaining).toHaveLength(1);
    });
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

  describe("row activation (FR-10, Task 8)", () => {
    const table: EntityAliasTable = {
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

    async function renderWithRow(onEntityActivated: (id: string) => void) {
      mockedGetEntityMentionCounts.mockResolvedValue({});
      const store = await setupStore(table);

      render(
        <Provider store={store}>
          <EntityRosterView onEntityActivated={onEntityActivated} />
        </Provider>,
      );

      return screen.findByRole("button", { name: /Anna/ });
    }

    it("invokes onEntityActivated with the row's entityId on click", async () => {
      const onEntityActivated = vi.fn();
      const button = await renderWithRow(onEntityActivated);

      button.click();

      expect(onEntityActivated).toHaveBeenCalledTimes(1);
      expect(onEntityActivated).toHaveBeenCalledWith("e-anna");
    });

    it("invokes onEntityActivated on Enter when the row's button has focus", async () => {
      const user = userEvent.setup();
      const onEntityActivated = vi.fn();
      const button = await renderWithRow(onEntityActivated);

      button.focus();
      expect(document.activeElement).toBe(button);
      // userEvent simulates real browser keyboard-activation semantics for a
      // native <button> (unlike a bare dispatched KeyboardEvent, which jsdom
      // does not translate into a click) — this is what actually proves
      // Enter activates the row, not merely that a click handler exists.
      await user.keyboard("{Enter}");

      expect(onEntityActivated).toHaveBeenCalledTimes(1);
      expect(onEntityActivated).toHaveBeenCalledWith("e-anna");
    });

    it("invokes onEntityActivated on Space when the row's button has focus", async () => {
      const user = userEvent.setup();
      const onEntityActivated = vi.fn();
      const button = await renderWithRow(onEntityActivated);

      button.focus();
      expect(document.activeElement).toBe(button);
      await user.keyboard(" ");

      expect(onEntityActivated).toHaveBeenCalledTimes(1);
      expect(onEntityActivated).toHaveBeenCalledWith("e-anna");
    });

    it("does not throw and is a no-op when onEntityActivated is not provided", async () => {
      mockedGetEntityMentionCounts.mockResolvedValue({});
      const store = await setupStore(table);

      render(
        <Provider store={store}>
          <EntityRosterView />
        </Provider>,
      );

      const button = await screen.findByRole("button", { name: /Anna/ });
      expect(() => button.click()).not.toThrow();
    });

    it("never calls updateSidecar or any sidecar-write path when a row is activated", async () => {
      const onEntityActivated = vi.fn();
      const button = await renderWithRow(onEntityActivated);

      button.click();

      expect(mockedUpdateSidecar).not.toHaveBeenCalled();
    });

    it("renders no control other than the row's activation button (no inline name/kind/alias editor)", async () => {
      mockedGetEntityMentionCounts.mockResolvedValue({});
      const store = await setupStore(table);

      render(
        <Provider store={store}>
          <EntityRosterView onEntityActivated={vi.fn()} />
        </Provider>,
      );

      await screen.findByRole("button", { name: /Anna/ });
      // The roster's only interactive controls are the row-activation
      // buttons — no text inputs / selects for editing name, entityKind, or
      // aliases in place.
      expect(screen.queryAllByRole("textbox")).toHaveLength(0);
      expect(screen.queryAllByRole("combobox")).toHaveLength(0);
      expect(screen.queryAllByRole("button").length).toBe(1);
    });
  });
});
