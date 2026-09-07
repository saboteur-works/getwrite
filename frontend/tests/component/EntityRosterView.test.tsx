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
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-mention-counts", () => ({
  getEntityMentionCounts: vi.fn(),
}));
vi.mock("../../src/lib/api/resources", () => ({ updateSidecar: vi.fn() }));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";
import { getEntityMentionCounts } from "../../src/lib/api/entity-mention-counts";
import { updateSidecar } from "../../src/lib/api/resources";

const mockedUpdateSidecar = vi.mocked(updateSidecar);

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
