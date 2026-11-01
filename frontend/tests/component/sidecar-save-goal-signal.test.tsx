import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import SubtypeSection from "../../components/Sidebar/SubtypeSection";
import WordCountGoalSection from "../../components/Sidebar/WordCountGoalSection";
import EntitySection from "../../components/Sidebar/EntitySection";
import RemoveEntityControl from "../../components/Sidebar/RemoveEntityControl";
import EntityRelationshipsRefreshProvider from "../../components/Sidebar/EntityRelationshipsRefreshContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";
import { EMPTY_ALIAS_TABLE } from "../../src/lib/api/entity-alias-table";
import {
  setGoalFilterActive,
  notifyAfterSidecarSave,
} from "../../src/lib/sidecar-save-signal";

/**
 * Feature 98 Task 29 (FR-33): every resolved `updateSidecar` call from the
 * sidebar callers signals the footer through one shared helper, only while a
 * goal filter is set, and never after a rejected save.
 */

const notifyMock = vi.fn();

vi.mock("../../src/lib/writing-log-signal", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/lib/writing-log-signal")
  >()),
  notifyWritingLogGoalChanged: () => notifyMock(),
}));

vi.mock("../../src/lib/api/resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/api/resources")>()),
  updateSidecar: vi.fn(),
}));

vi.mock("../../src/lib/api/entity-relationships", () => ({
  listEntityRelationshipsOrThrow: vi.fn().mockResolvedValue([]),
  removeEntityRelationshipsForEntity: vi.fn(),
}));

vi.mock("../../src/lib/toast-service", () => ({
  toastService: { error: vi.fn(), success: vi.fn() },
}));

import { updateSidecar } from "../../src/lib/api/resources";

const mockedUpdateSidecar = vi.mocked(updateSidecar);
const PROJECT_ID = "proj-signal-1";
const RESOURCE_ID = "res-signal-1";

function setupStore(overrides: Partial<AnyResource> = {}) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Test Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      subtypes: ["Scene"],
    } as Parameters<typeof setProject>[0]),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  const res = createTextResource({ name: "Doc" });
  (res as unknown as { id: string }).id = RESOURCE_ID;
  Object.assign(res, overrides);
  store.dispatch(setResources([res] as AnyResource[]));
  store.dispatch(setSelectedResourceId(RESOURCE_ID));
  return store;
}

function stubFetch(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input.toString();
    if (url.includes("/api/project/noise-words")) {
      return {
        ok: true,
        json: async () => ({
          customNoiseWords: [],
          excludedGlobalNoiseWords: [],
        }),
      } as Response;
    }
    if (url.includes("/api/global-noise-words")) {
      return { ok: true, json: async () => [] } as Response;
    }
    if (url.includes("/entity-alias-table")) {
      return { ok: true, json: async () => EMPTY_ALIAS_TABLE } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

interface SavePath {
  name: string;
  /** Renders the component and triggers one save. */
  trigger: () => Promise<void>;
}

function renderWith(
  node: React.ReactElement,
  overrides?: Partial<AnyResource>,
): void {
  const store = setupStore(overrides);
  render(<Provider store={store}>{node}</Provider>);
}

const PATHS: SavePath[] = [
  {
    name: "SubtypeSection",
    trigger: async () => {
      renderWith(<SubtypeSection />);
      fireEvent.change(screen.getByRole("combobox", { name: "Subtype" }), {
        target: { value: "Scene" },
      });
    },
  },
  {
    name: "WordCountGoalSection",
    trigger: async () => {
      renderWith(<WordCountGoalSection />);
      fireEvent.change(screen.getByLabelText("word-count-goal-input"), {
        target: { value: "2000" },
      });
    },
  },
  {
    name: "EntitySection",
    trigger: async () => {
      stubFetch();
      renderWith(<EntitySection />);
      fireEvent.change(screen.getByLabelText("entity-kind-input"), {
        target: { value: "character" },
      });
    },
  },
  {
    name: "RemoveEntityControl",
    trigger: async () => {
      stubFetch();
      renderWith(
        <EntityRelationshipsRefreshProvider>
          <input aria-label="entity-kind-input" defaultValue="character" />
          <RemoveEntityControl />
        </EntityRelationshipsRefreshProvider>,
        { entityKind: "character" } as Partial<AnyResource>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Remove Entity" }));
      await waitFor(() =>
        expect(
          screen.getByText("Remove") as HTMLButtonElement,
        ).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByText("Remove"));
    },
  },
];

beforeEach(() => {
  notifyMock.mockReset();
  mockedUpdateSidecar.mockReset();
  setGoalFilterActive(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  setGoalFilterActive(false);
});

describe("notifyAfterSidecarSave", () => {
  it("signals only while the goal filter flag is set", () => {
    notifyAfterSidecarSave();
    expect(notifyMock).not.toHaveBeenCalled();
    setGoalFilterActive(true);
    notifyAfterSidecarSave();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    setGoalFilterActive(false);
    notifyAfterSidecarSave();
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });
});

describe.each(PATHS)("$name sidecar save (FR-33)", ({ trigger }) => {
  it("signals once after a resolved save while a filter is set", async () => {
    mockedUpdateSidecar.mockResolvedValue(undefined);
    setGoalFilterActive(true);
    await trigger();
    await waitFor(() => expect(mockedUpdateSidecar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(notifyMock).toHaveBeenCalledTimes(1));
  });

  it("does not signal after a resolved save when no filter is set", async () => {
    mockedUpdateSidecar.mockResolvedValue(undefined);
    await trigger();
    await waitFor(() => expect(mockedUpdateSidecar).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("does not signal after a rejected save, even with a filter set", async () => {
    mockedUpdateSidecar.mockRejectedValue(new Error("write failed"));
    setGoalFilterActive(true);
    await trigger();
    await waitFor(() => expect(mockedUpdateSidecar).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
