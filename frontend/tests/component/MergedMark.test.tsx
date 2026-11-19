/**
 * Feature 121, Task 36 (FR-16): the merged mark in the tree row and the notice
 * line at the top of the open merged document, with a distinct stated state
 * for each way the target cannot be named. The tree is the real `ResourceTree`
 * over a real store; the reads (`fetchSplitResourceContent`, `listTrash`) are
 * mocked at the transport.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import ResourceTree from "../../components/ResourceTree/ResourceTree";
import TipTapEditor from "../../components/TipTapEditor";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setFolders, setResources } from "../../src/store/resourcesSlice";
import { makeStore } from "../../src/store/store";
import { createTextResource } from "../../src/lib/models/resource";
import {
  MERGE_MARK_STATE_MESSAGES,
  MERGED_NOTICE_LINE,
  MERGED_TREE_LABEL_RULE,
} from "../../src/lib/models/merge-messages";
import { MERGED_MARK_SIDECAR_KEY } from "../../src/lib/models/merge-types";
import { ProjectLockedError } from "../../src/lib/models/crypto/locked-errors";
import { MERGED_MARK_CHECKING_LABEL } from "../../components/Merge/useMergedMarkState";

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

function markOf(targetId: string) {
  return {
    targetDocumentId: targetId,
    targetSnapshotRevisionId: SNAPSHOT,
    date: NOW,
  };
}

interface Options {
  /** Is the target in the store (a live document)? */
  isTargetLive?: boolean;
  /** Replaces the stored mark on both absorbed documents. */
  mark?: unknown;
  /** False: the store project has no on-disk directory to read from. */
  hasProjectDirectory?: boolean;
}

function buildStore({
  isTargetLive = true,
  mark,
  hasProjectDirectory = true,
}: Options = {}) {
  const target = {
    ...createTextResource({ name: "Target", folderId: null, plainText: "t" }),
    orderIndex: 0,
  };
  const withMark = (name: string, order: number) => ({
    ...createTextResource({ name, folderId: null, plainText: name }),
    orderIndex: order,
    [MERGED_MARK_SIDECAR_KEY]: mark === undefined ? markOf(target.id) : mark,
  });
  const absorbedB = withMark("Absorbed B", 1);
  const absorbedC = withMark("Absorbed C", 2);
  const plain = {
    ...createTextResource({ name: "Plain", folderId: null, plainText: "p" }),
    orderIndex: 3,
  };
  const docs = [...(isTargetLive ? [target] : []), absorbedB, absorbedC, plain];
  const store = makeStore();
  store.dispatch(
    setProject({
      id: "p1",
      name: "proj",
      createdAt: NOW,
      rootPath: hasProjectDirectory
        ? "/ws/projects/11111111-1111-4111-8111-111111111111"
        : undefined,
      resources: [],
    } as never),
  );
  store.dispatch(setSelectedProjectId("p1"));
  store.dispatch(setFolders([]));
  store.dispatch(setResources(docs as never));
  return { store, target, absorbedB, absorbedC, plain };
}

/** Renders the tree; `beforeRender` sees the built fixtures (their ids) before any read starts. */
function renderTree(
  options?: Options,
  beforeRender?: (built: ReturnType<typeof buildStore>) => void,
) {
  const built = buildStore(options);
  beforeRender?.(built);
  const utils = render(
    <Provider store={built.store}>
      <ResourceTree />
    </Provider>,
  );
  return { ...built, ...utils };
}

function row(name: string): HTMLElement {
  const node = screen.getByText(name).closest('[role="treeitem"]');
  if (!node) throw new Error(`No row named ${name}`);
  return node as HTMLElement;
}

function labelIn(name: string): HTMLElement | null {
  return within(row(name)).queryByTestId("merged-mark-label");
}

function revisions(...ids: string[]) {
  return { revisions: ids.map((id) => ({ id, isCanonical: false })) };
}

beforeEach(() => {
  fetchResourceContent.mockResolvedValue(revisions(SNAPSHOT));
  listTrash.mockResolvedValue({ resources: [], folders: [] });
});

afterEach(() => {
  fetchResourceContent.mockReset();
  listTrash.mockReset();
});

describe("tree row: the target is named", () => {
  it("shows Merged into and the target's name as visible text on each absorbed row", async () => {
    renderTree();
    await waitFor(() =>
      expect(labelIn("Absorbed B")?.textContent).toBe("Merged into “Target”"),
    );
    expect(labelIn("Absorbed C")?.textContent).toBe("Merged into “Target”");
    expect(labelIn("Absorbed B")?.getAttribute("data-state")).toBe("available");
  });

  it("shows no mark on an unmarked row, the target included", async () => {
    renderTree();
    await waitFor(() =>
      expect(labelIn("Absorbed B")?.textContent).toBeTruthy(),
    );
    expect(labelIn("Plain")).toBeNull();
    expect(labelIn("Target")).toBeNull();
  });

  it("resolves the name from the target id, so a rename shows", async () => {
    const { store, target } = renderTree();
    await waitFor(() => expect(labelIn("Absorbed B")).toBeTruthy());
    act(() => {
      store.dispatch(
        setResources([
          { ...target, name: "Renamed target" },
          ...(store
            .getState()
            .resources.resources.filter(
              (r: { id: string }) => r.id !== target.id,
            ) as never[]),
        ] as never),
      );
    });
    await waitFor(() =>
      expect(labelIn("Absorbed B")?.textContent).toBe(
        "Merged into “Renamed target”",
      ),
    );
  });

  it("reads the revision list once for the two rows that share a target and snapshot", async () => {
    renderTree();
    await waitFor(() =>
      expect(labelIn("Absorbed C")?.textContent).toMatch(/Target/),
    );
    expect(fetchResourceContent).toHaveBeenCalledTimes(1);
    expect(listTrash).not.toHaveBeenCalled();
  });

  it("is text and not colour alone, uses no red, and is exposed with its rule", async () => {
    renderTree();
    await waitFor(() =>
      expect(labelIn("Absorbed B")?.textContent).toBeTruthy(),
    );
    const label = labelIn("Absorbed B") as HTMLElement;
    expect(label.className).not.toMatch(/red/i);
    expect(label.getAttribute("style") ?? "").not.toMatch(/red|#d44040/i);
    expect(label.textContent?.length).toBeGreaterThan(0);
    // The row is a tree item whose text content includes the label, and it is
    // described by the one-line rule.
    const treeItem = row("Absorbed B");
    expect(treeItem.textContent).toContain("Merged into “Target”");
    const describedBy = treeItem.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      MERGED_TREE_LABEL_RULE,
    );
  });

  it("holds no control that clears the mark", async () => {
    renderTree();
    await waitFor(() => expect(labelIn("Absorbed B")).toBeTruthy());
    expect(
      within(labelIn("Absorbed B") as HTMLElement).queryAllByRole("button"),
    ).toHaveLength(0);
    expect(
      screen.queryByRole("menuitem", { name: /unmerge|clear/i }),
    ).toBeNull();
  });

  it("shows the same after a reload (a fresh mount over the same stored data)", async () => {
    const first = renderTree();
    await waitFor(() =>
      expect(labelIn("Absorbed B")?.textContent).toBe("Merged into “Target”"),
    );
    first.unmount();
    renderTree();
    await waitFor(() =>
      expect(labelIn("Absorbed B")?.textContent).toBe("Merged into “Target”"),
    );
  });
});

describe("tree row: the target cannot be named", () => {
  it("says it is checking until the reads finish, and does not read as live", async () => {
    let finish: (value: unknown) => void = () => undefined;
    fetchResourceContent.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderTree();
    expect(labelIn("Absorbed B")?.textContent).toBe(MERGED_MARK_CHECKING_LABEL);
    expect(labelIn("Absorbed B")?.getAttribute("data-state")).toBe("checking");
    await act(async () => {
      finish(revisions(SNAPSHOT));
    });
    await waitFor(() =>
      expect(labelIn("Absorbed B")?.textContent).toBe("Merged into “Target”"),
    );
  });

  it("revision no longer kept: the target is live and its snapshot is not among its revisions", async () => {
    fetchResourceContent.mockResolvedValue(revisions("another-revision"));
    renderTree();
    await waitFor(() =>
      expect(labelIn("Absorbed B")?.textContent).toBe(
        MERGE_MARK_STATE_MESSAGES["revision-no-longer-kept"],
      ),
    );
    expect(labelIn("Absorbed B")?.getAttribute("data-state")).toBe(
      "revision-no-longer-kept",
    );
  });

  it("target in Trash: not in the tree and listed in Trash", async () => {
    renderTree({ isTargetLive: false }, ({ target }) => {
      listTrash.mockResolvedValue({
        resources: [{ id: target.id, originalName: "Target" }],
        folders: [],
      });
    });
    await waitFor(() =>
      expect(labelIn("Absorbed B")?.textContent).toBe(
        MERGE_MARK_STATE_MESSAGES["target-in-trash"],
      ),
    );
    expect(labelIn("Absorbed B")?.getAttribute("data-state")).toBe(
      "target-in-trash",
    );
    expect(fetchResourceContent).not.toHaveBeenCalled();
  });

  it("target in Trash under a trashed folder", async () => {
    renderTree({ isTargetLive: false }, ({ target }) => {
      listTrash.mockResolvedValue({
        resources: [],
        folders: [
          {
            id: "f",
            originalName: "F",
            descendants: [
              { id: target.id, kind: "resource", parentId: "f", orderIndex: 0 },
            ],
          },
        ],
      });
    });
    await waitFor(() =>
      expect(labelIn("Absorbed B")?.getAttribute("data-state")).toBe(
        "target-in-trash",
      ),
    );
  });

  it("target permanently removed: not in the tree and not in Trash", async () => {
    renderTree({ isTargetLive: false });
    await waitFor(() =>
      expect(labelIn("Absorbed B")?.textContent).toBe(
        MERGE_MARK_STATE_MESSAGES["target-permanently-removed"],
      ),
    );
    expect(listTrash).toHaveBeenCalledTimes(1);
  });

  describe("could not be checked", () => {
    const expected = MERGE_MARK_STATE_MESSAGES["could-not-be-checked"];

    async function expectCouldNotBeChecked() {
      await waitFor(() =>
        expect(labelIn("Absorbed B")?.textContent).toBe(expected),
      );
      expect(labelIn("Absorbed B")?.getAttribute("data-state")).toBe(
        "could-not-be-checked",
      );
      // Never blank, never the live label.
      expect(labelIn("Absorbed B")?.textContent).not.toMatch(/Merged into “/);
    }

    it("when the revision list cannot be read", async () => {
      fetchResourceContent.mockResolvedValue(null);
      renderTree();
      await expectCouldNotBeChecked();
    });

    it("when the revision read throws (a locked project)", async () => {
      fetchResourceContent.mockRejectedValue(new ProjectLockedError("locked"));
      renderTree();
      await expectCouldNotBeChecked();
    });

    it("when the response holds no revision list", async () => {
      fetchResourceContent.mockResolvedValue({});
      renderTree();
      await expectCouldNotBeChecked();
    });

    it("when the Trash listing cannot be read", async () => {
      listTrash.mockRejectedValue(new Error("network"));
      renderTree({ isTargetLive: false });
      await expectCouldNotBeChecked();
    });

    it("when the stored mark is not well formed", async () => {
      renderTree({ mark: "merged" });
      await expectCouldNotBeChecked();
      expect(fetchResourceContent).not.toHaveBeenCalled();
    });

    it("when no project directory is open to read from", async () => {
      renderTree({ hasProjectDirectory: false });
      await expectCouldNotBeChecked();
      expect(fetchResourceContent).not.toHaveBeenCalled();
    });
  });
});

describe("notice line in the open merged document", () => {
  function renderEditor(
    resourceId: string,
    options?: Options,
    beforeRender?: (built: ReturnType<typeof buildStore>) => void,
  ) {
    const built = buildStore(options);
    beforeRender?.(built);
    const id = resourceId === "absorbed" ? built.absorbedB.id : built.plain.id;
    const utils = render(
      <Provider store={built.store}>
        <TipTapEditor value="<p>Body</p>" annotationResourceId={id} />
      </Provider>,
    );
    return { ...utils, ...built };
  }

  it("states the mark and the rule above the editor, as a note", async () => {
    renderEditor("absorbed");
    const note = await screen.findByRole("note");
    await waitFor(() =>
      expect(note.textContent).toContain("Merged into “Target”"),
    );
    expect(note.textContent).toContain(MERGED_NOTICE_LINE);
    // At the top: it comes before the editor's own content.
    const shell = note.parentElement as HTMLElement;
    expect(shell.firstElementChild).toBe(note);
    expect(note.className).not.toMatch(/red/i);
  });

  it("is reachable by keyboard and not by hover alone", async () => {
    renderEditor("absorbed");
    const note = await screen.findByRole("note");
    expect(note.tabIndex).toBe(0);
    note.focus();
    expect(document.activeElement).toBe(note);
    expect(note.getAttribute("title")).toBeNull();
  });

  it("leaves the editor editable and holds no control", async () => {
    renderEditor("absorbed");
    const note = await screen.findByRole("note");
    expect(within(note).queryAllByRole("button")).toHaveLength(0);
    // The mock editor of the test environment has no read-only state to set;
    // the notice passes no `readonly` and takes none.
    expect(
      screen.getByTestId("tiptap-mock").getAttribute("aria-readonly"),
    ).toBeNull();
  });

  it("shows nothing on a document that is not merged", () => {
    renderEditor("plain");
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("keeps the rule text and states it while the target is in Trash", async () => {
    renderEditor("absorbed", { isTargetLive: false }, ({ target }) => {
      listTrash.mockResolvedValue({
        resources: [{ id: target.id, originalName: "Target" }],
        folders: [],
      });
    });
    const note = await screen.findByRole("note");
    await waitFor(() =>
      expect(note.textContent).toContain(
        MERGE_MARK_STATE_MESSAGES["target-in-trash"],
      ),
    );
    expect(note.textContent).toContain(MERGED_NOTICE_LINE);
    expect(within(note).queryAllByRole("button")).toHaveLength(0);
  });

  it("keeps the rule text and states it while the target is permanently removed", async () => {
    renderEditor("absorbed", { isTargetLive: false });
    const note = await screen.findByRole("note");
    await waitFor(() =>
      expect(note.textContent).toContain(
        MERGE_MARK_STATE_MESSAGES["target-permanently-removed"],
      ),
    );
    expect(note.textContent).toContain(MERGED_NOTICE_LINE);
    expect(within(note).queryAllByRole("button")).toHaveLength(0);
  });

  it("states the revision is no longer kept and keeps the rule", async () => {
    fetchResourceContent.mockResolvedValue(revisions("another-revision"));
    renderEditor("absorbed");
    const note = await screen.findByRole("note");
    await waitFor(() =>
      expect(note.textContent).toContain(
        MERGE_MARK_STATE_MESSAGES["revision-no-longer-kept"],
      ),
    );
    expect(note.textContent).toContain(MERGED_NOTICE_LINE);
  });

  it("states could-not-be-checked and keeps the rule when the reads fail", async () => {
    fetchResourceContent.mockResolvedValue(null);
    renderEditor("absorbed");
    const note = await screen.findByRole("note");
    await waitFor(() =>
      expect(note.textContent).toContain(
        MERGE_MARK_STATE_MESSAGES["could-not-be-checked"],
      ),
    );
    expect(note.textContent).toContain(MERGED_NOTICE_LINE);
  });
});
