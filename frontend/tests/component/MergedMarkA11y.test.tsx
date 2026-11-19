/**
 * Feature 121, Task 36 (FR-16, FR-23): axe and keyboard operability of the
 * merged mark in the tree row and of the notice line. Colour contrast is not
 * measured here (jsdom has no layout); it is the lead's Storybook run.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import ResourceTree from "../../components/ResourceTree/ResourceTree";
import MergedNoticeLine from "../../components/Merge/MergedNoticeLine";
import MergedMarkLabel from "../../components/Merge/MergedMarkLabel";
import {
  MERGED_MARK_CHECKING_LABEL,
  type MergedMarkView,
} from "../../components/Merge/useMergedMarkState";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setFolders, setResources } from "../../src/store/resourcesSlice";
import { makeStore } from "../../src/store/store";
import { createTextResource } from "../../src/lib/models/resource";
import {
  describeMergedMarkLabel,
  MERGE_MARK_STATE_MESSAGES,
} from "../../src/lib/models/merge-messages";
import { MERGED_MARK_SIDECAR_KEY } from "../../src/lib/models/merge-types";
import { runAxe } from "../a11y/helpers/axe";

const fetchResourceContent = vi.fn();
vi.mock("../../src/lib/api/split-stored-read", () => ({
  fetchSplitResourceContent: (...args: unknown[]) =>
    fetchResourceContent(...args),
  fetchSplitRevisionContent: vi.fn(),
}));
const listTrash = vi.fn();
vi.mock("../../src/lib/api/trash", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/lib/api/trash")>();
  return { ...original, listTrash: (...args: unknown[]) => listTrash(...args) };
});

const NOW = "2026-01-01T00:00:00.000Z";
const SNAPSHOT = "5b0c7f0e-8a3d-4c55-9d1e-2f6a1c9b7e42";

const VIEWS: Record<string, MergedMarkView> = {
  available: {
    state: "available",
    label: describeMergedMarkLabel({ state: "available" }, "Chapter 3"),
  },
  checking: { state: "checking", label: MERGED_MARK_CHECKING_LABEL },
  "revision-no-longer-kept": {
    state: "revision-no-longer-kept",
    label: MERGE_MARK_STATE_MESSAGES["revision-no-longer-kept"],
  },
  "target-in-trash": {
    state: "target-in-trash",
    label: MERGE_MARK_STATE_MESSAGES["target-in-trash"],
  },
  "target-permanently-removed": {
    state: "target-permanently-removed",
    label: MERGE_MARK_STATE_MESSAGES["target-permanently-removed"],
  },
  "could-not-be-checked": {
    state: "could-not-be-checked",
    label: MERGE_MARK_STATE_MESSAGES["could-not-be-checked"],
  },
};

beforeEach(() => {
  fetchResourceContent.mockResolvedValue({
    revisions: [{ id: SNAPSHOT, isCanonical: false }],
  });
  listTrash.mockResolvedValue({ resources: [], folders: [] });
});

afterEach(() => {
  fetchResourceContent.mockReset();
  listTrash.mockReset();
});

describe("notice line", () => {
  it.each(Object.entries(VIEWS))(
    "has no axe violations in the %s state",
    async (_state, view) => {
      const { container } = render(<MergedNoticeLine view={view} />);
      await runAxe(container, ["region"]);
    },
  );

  it("is reached with the Tab key and read as a note", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <MergedNoticeLine view={VIEWS.available} />
      </>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByText("Before"));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("note"));
  });

  it("is named, and states its label and the rule as text", () => {
    render(<MergedNoticeLine view={VIEWS["target-in-trash"]} />);
    const note = screen.getByRole("note", { name: "This document was merged" });
    expect(note.textContent).toContain(
      MERGE_MARK_STATE_MESSAGES["target-in-trash"],
    );
  });
});

describe("tree row label", () => {
  it.each(Object.entries(VIEWS))(
    "has no axe violations in the %s state",
    async (_state, view) => {
      const { container } = render(
        <ul>
          <li>
            Row
            <MergedMarkLabel view={view} ruleId="rule-1" />
          </li>
        </ul>,
      );
      await runAxe(container, ["region"]);
    },
  );
});

describe("tree with merged rows", () => {
  it("has no axe violations once the marks have resolved", async () => {
    const target = {
      ...createTextResource({ name: "Target", folderId: null, plainText: "t" }),
      orderIndex: 0,
    };
    const absorbed = {
      ...createTextResource({
        name: "Absorbed",
        folderId: null,
        plainText: "a",
      }),
      orderIndex: 1,
      [MERGED_MARK_SIDECAR_KEY]: {
        targetDocumentId: target.id,
        targetSnapshotRevisionId: SNAPSHOT,
        date: NOW,
      },
    };
    const store = makeStore();
    store.dispatch(
      setProject({
        id: "p1",
        name: "proj",
        createdAt: NOW,
        rootPath: "/ws/projects/11111111-1111-4111-8111-111111111111",
        resources: [],
      } as never),
    );
    store.dispatch(setSelectedProjectId("p1"));
    store.dispatch(setFolders([]));
    store.dispatch(setResources([target, absorbed] as never));
    const { container } = render(
      <Provider store={store}>
        <ResourceTree />
      </Provider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("merged-mark-label").textContent).toBe(
        "Merged into “Target”",
      ),
    );
    await runAxe(container, ["region"]);
  });
});
