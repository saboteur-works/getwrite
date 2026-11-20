/**
 * Feature 121, Task 41 (FR-22, FR-14, FR-23): the "Undo merge" action in the
 * command palette and the editor context menu, and the dismissable Undo toast
 * for a merge (and for a split). jsdom only: the editor is a stand-in object
 * where the host reads it, and a real TipTap editor where the menu needs one.
 * The Undo request and the reads are fakes. Not evidence about a screen
 * reader, a device or a real server.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import toast, { Toaster } from "react-hot-toast";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { Schema } from "@tiptap/pm/model";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import projectsReducer, {
  setProject,
  setSelectedProjectId,
  type StoredProject,
} from "../../src/store/projectsSlice";
import resourcesReducer, { setResources } from "../../src/store/resourcesSlice";
import SplitUndoHost from "../../components/Split/SplitUndoHost";
import { UndoToastView } from "../../components/Split/UndoToast";
import ResourceCommandPalette from "../../components/common/ResourceCommandPalette";
import EditorContextMenu from "../../components/Editor/EditorContextMenu";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import {
  setActiveEditor,
  setActiveEditorResourceId,
} from "../../components/Editor/activeEditorRegistry";
import {
  getSplitUndoAvailability,
  setSplitUndoAvailability,
} from "../../components/Split/splitUndoRequest";
import { describeUndoMergeAction } from "../../src/lib/models/merge-messages";
import {
  describeUndoMergeFailure,
  describeUndoMergeIndexFailure,
  describeUndoMergeSuccess,
  MERGE_UNDO_REFUSAL_MESSAGES,
  UNDO_MERGE_COULD_NOT_BE_CHECKED_MESSAGE,
  UNDO_MERGE_EDITOR_HELD_MESSAGE,
  UNDO_MERGE_INVALID_REQUEST_MESSAGE,
  UNDO_MERGE_LABEL,
  UNDO_MERGE_LOCKED_MESSAGE,
  UNDO_MERGE_NOTHING_TO_UNDO_MESSAGE,
  UNDO_MERGE_READ_FAILED_MESSAGE,
  UNDO_MERGE_READ_LOCKED_MESSAGE,
  UNDO_MERGE_RELOAD_FAILED_MESSAGE,
  UNDO_MERGE_REMAINING_STATE_MESSAGES,
  UNDO_MERGE_SAVE_FAILED_MESSAGE,
  UNDO_MERGE_STEP_LABELS,
  UNDO_MERGE_TRANSPORT_FAILED_MESSAGE,
  UNDO_MERGE_TREE_REFRESH_FAILED_MESSAGE,
  UNDO_MERGE_UNEXPECTED_FAILURE_MESSAGE,
  UNDO_MERGE_WORKING_MESSAGE,
} from "../../src/lib/models/merge-undo-messages";
import { UNDO_SPLIT_READ_FAILED_MESSAGE } from "../../src/lib/models/split-messages";
import { ProjectLockedError } from "../../src/lib/models/crypto/locked-errors";
import type { AnyResource } from "../../src/lib/models/types";
import type { TipTapDocument } from "../../src/lib/models";
import { runAxe } from "../a11y/helpers/axe";

// The store setup below triggers an unrelated alias-table read that fails in
// jsdom and would raise a stray "could not be loaded" toast beside the Undo ones.
vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const requestLatestSplitOperation = vi.fn();
const requestUndoSplit = vi.fn();
vi.mock("../../src/lib/api/split", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/lib/api/split")>();
  return {
    ...original,
    requestLatestSplitOperation: (...args: unknown[]) =>
      requestLatestSplitOperation(...args),
    requestUndoSplit: (...args: unknown[]) => requestUndoSplit(...args),
  };
});

const fetchResourceContent = vi.fn();
const fetchRevisionContent = vi.fn();
vi.mock("../../src/lib/api/split-stored-read", () => ({
  fetchSplitResourceContent: (...args: unknown[]) =>
    fetchResourceContent(...args),
  fetchSplitRevisionContent: (...args: unknown[]) =>
    fetchRevisionContent(...args),
}));

const openProject = vi.fn();
vi.mock("../../src/lib/api/projects", () => ({
  openProject: (...args: unknown[]) => openProject(...args),
}));

vi.mock("../../src/store/revisionsSlice", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/store/revisionsSlice")>();
  return {
    ...original,
    loadRevisionsForSelectedResource: () => ({ type: "test/loadRevisions" }),
  };
});

const flushPendingSaves = vi.fn();
vi.mock("../../src/lib/pending-saves", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/lib/pending-saves")>();
  return {
    ...original,
    flushPendingSaves: (...args: unknown[]) => flushPendingSaves(...args),
  };
});

const PROJECT_DIR = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const ABSORBED_A = "33333333-3333-4333-8333-333333333333";
const ABSORBED_B = "55555555-5555-4555-8555-555555555555";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";

function resource(id: string, name: string): AnyResource {
  return {
    id,
    name,
    type: "text",
    createdAt: "2026-01-01T00:00:00.000Z",
  } as AnyResource;
}

const TREE: AnyResource[] = [
  resource(TARGET_ID, "Chapter 3"),
  resource(ABSORBED_A, "Scene A"),
  resource(ABSORBED_B, "Scene B"),
  resource(OTHER_ID, "Unrelated notes"),
];

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: { group: "inline" },
  },
});

function p(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

const MERGED_TEXT: TipTapDocument = {
  type: "doc",
  content: [p("First"), p("Second")],
} as TipTapDocument;
const RESTORED_TEXT: TipTapDocument = {
  type: "doc",
  content: [p("First")],
} as TipTapDocument;

interface FakeEditor {
  editor: Editor;
  loaded: unknown[];
  editable: boolean[];
}

function makeFakeEditor(initial: TipTapDocument): FakeEditor {
  let json = initial;
  const state = { doc: schema.nodeFromJSON(json), selection: { head: 0 } };
  const loaded: unknown[] = [];
  const editable: boolean[] = [];
  const editor = {
    isDestroyed: false,
    state,
    getJSON: () => json,
    setEditable: (value: boolean) => {
      editable.push(value);
    },
    chain: () => {
      const chain = {
        setMeta: () => chain,
        setContent: (doc: TipTapDocument) => {
          loaded.push(doc);
          json = doc;
          state.doc = schema.nodeFromJSON(doc);
          return chain;
        },
        run: () => true,
      };
      return chain;
    },
    commands: { setTextSelection: () => true, scrollIntoView: () => true },
  } as unknown as Editor;
  return { editor, loaded, editable };
}

function makeStore() {
  const store = configureStore({
    reducer: { projects: projectsReducer, resources: resourcesReducer },
  });
  store.dispatch(
    setProject({
      id: PROJECT_DIR,
      name: "Alpha",
      createdAt: "2026-01-01T00:00:00.000Z",
      rootPath: `/ws/projects/${PROJECT_DIR}`,
      folders: [],
      resources: TREE,
    } as unknown as StoredProject),
  );
  store.dispatch(setSelectedProjectId(PROJECT_DIR));
  store.dispatch(setResources(TREE));
  return store;
}

const MERGE_RECORD = {
  kind: "merge",
  affectedDocumentIds: [TARGET_ID, ABSORBED_A, ABSORBED_B],
  snapshotRevisions: [],
  newDocumentId: TARGET_ID,
  date: "2026-11-18T10:00:00.000Z",
};
const SPLIT_RECORD = {
  kind: "split",
  affectedDocumentIds: [TARGET_ID, ABSORBED_A],
  snapshotRevisions: [],
  newDocumentId: ABSORBED_A,
  date: "2026-11-18T10:00:00.000Z",
};

function latestIsMerge(): void {
  requestLatestSplitOperation.mockResolvedValue({
    kind: "record",
    record: MERGE_RECORD,
  });
}

const MERGE_APPLIED = {
  kind: "merge-applied" as const,
  targetDocumentId: TARGET_ID,
  targetName: "Chapter 3",
  absorbedCount: 2,
  absorbedDocumentIds: [ABSORBED_A, ABSORBED_B],
  skippedDocuments: [],
  preservedRevisions: [],
  movedAnnotationIds: [],
};

let stored: string;

function Harness({
  openResourceId,
  onClose,
}: {
  openResourceId: string | null;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = React.useState<boolean>(true);
  return (
    <>
      <Toaster />
      <SplitUndoHost />
      <button type="button" onClick={() => setIsOpen(true)}>
        reopen palette
      </button>
      <ResourceCommandPalette
        isOpen={isOpen}
        resources={TREE}
        onClose={() => {
          setIsOpen(false);
          onClose();
        }}
        onSelectResource={vi.fn()}
        openResourceId={openResourceId}
      />
    </>
  );
}

function renderPalette(openResourceId: string | null = null) {
  const store = makeStore();
  const onClose = vi.fn();
  const utils = render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <Harness openResourceId={openResourceId} onClose={onClose} />
      </TrashRefreshProvider>
    </Provider>,
  );
  return { store, onClose, ...utils };
}

const undoMergeOption = (): Promise<HTMLElement> =>
  screen.findByRole("option", { name: /Undo merge/ });

async function runUndoFromPalette() {
  const option = await undoMergeOption();
  await act(async () => {
    fireEvent.click(option);
  });
}

beforeEach(() => {
  // react-hot-toast reads the reduced-motion preference; jsdom has no matchMedia.
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  stored = JSON.stringify(RESTORED_TEXT);
  requestLatestSplitOperation.mockReset();
  requestUndoSplit.mockReset();
  flushPendingSaves.mockReset();
  flushPendingSaves.mockResolvedValue(true);
  fetchResourceContent.mockImplementation(async () => ({
    revisions: [
      { id: "34205ec3-fe37-41ee-96f9-e331e95e5475", isCanonical: true },
    ],
  }));
  fetchRevisionContent.mockImplementation(async () => stored);
  openProject.mockResolvedValue({ resources: TREE, folders: [] });
  setSplitUndoAvailability({ kind: "unknown" });
  vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "");
});

afterEach(() => {
  toast.remove();
  setActiveEditor(null);
  setActiveEditorResourceId(null);
  vi.unstubAllEnvs();
});

describe("Undo merge in the command palette", () => {
  it("appears while the latest operation is a merge, with an unrelated document open, naming the target and the number of absorbed documents", async () => {
    latestIsMerge();
    renderPalette(OTHER_ID);
    const option = await undoMergeOption();
    expect(option.textContent).toContain("Chapter 3");
    expect(option.textContent).toContain("2 other documents");
    expect(option.textContent).toBe(
      `${UNDO_MERGE_LABEL}Action${describeUndoMergeAction("Chapter 3", 2)}`,
    );
    expect(screen.queryByRole("option", { name: /Undo split/ })).toBeNull();
  });

  it("states that the merged mark is removed from the other documents and that edits made since are kept", () => {
    const text = describeUndoMergeAction("Chapter 3", 2);
    expect(text).toContain("removes the merged mark from the 2 other");
    expect(text).toContain("which stay where they are in the tree");
    expect(text).toContain("Edits made since the merge are kept");
  });

  it("appears with no document open", async () => {
    latestIsMerge();
    renderPalette(null);
    await undoMergeOption();
  });

  it("is reachable after a reload: a fresh mount reads the stored record", async () => {
    latestIsMerge();
    const first = renderPalette();
    await undoMergeOption();
    first.unmount();
    setSplitUndoAvailability({ kind: "unknown" });
    requestLatestSplitOperation.mockClear();
    renderPalette();
    await undoMergeOption();
    expect(requestLatestSplitOperation).toHaveBeenCalledTimes(1);
  });

  it("is absent when the record is none, and is not offered for a split record (Undo split is)", async () => {
    requestLatestSplitOperation.mockResolvedValue({ kind: "none" });
    const first = renderPalette();
    await waitFor(() => expect(requestLatestSplitOperation).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.queryByRole("option", { name: /Undo merge/ })).toBeNull();
    first.unmount();
    setSplitUndoAvailability({ kind: "unknown" });
    requestLatestSplitOperation.mockResolvedValue({
      kind: "record",
      record: SPLIT_RECORD,
    });
    renderPalette();
    await screen.findByRole("option", { name: /Undo split/ });
    expect(screen.queryByRole("option", { name: /Undo merge/ })).toBeNull();
  });

  it("a failed read shows its own disabled message for a merge and does not read as no merge", async () => {
    requestLatestSplitOperation.mockResolvedValue({
      kind: "failed",
      cause: "transport-failed",
    });
    renderPalette();
    const option = await undoMergeOption();
    expect(option.getAttribute("aria-disabled")).toBe("true");
    expect(option.textContent).toContain(UNDO_MERGE_READ_FAILED_MESSAGE);
    fireEvent.click(option);
    expect(requestUndoSplit).not.toHaveBeenCalled();
    const split = await screen.findByRole("option", { name: /Undo split/ });
    expect(split.textContent).toContain(UNDO_SPLIT_READ_FAILED_MESSAGE);
  });

  it("a thrown read of a locked project shows the locked read message", async () => {
    requestLatestSplitOperation.mockRejectedValue(
      new ProjectLockedError(PROJECT_DIR),
    );
    renderPalette();
    const option = await undoMergeOption();
    expect(option.textContent).toContain(UNDO_MERGE_READ_LOCKED_MESSAGE);
  });

  it("is operable with the keyboard from the search box and sends Undo for the project", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue(MERGE_APPLIED);
    const { onClose } = renderPalette();
    await undoMergeOption();
    const input = screen.getByPlaceholderText("Search resources...");
    fireEvent.change(input, { target: { value: "undo m" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onClose).toHaveBeenCalled();
    await waitFor(() =>
      expect(requestUndoSplit).toHaveBeenCalledWith(PROJECT_DIR),
    );
  });

  it("is not offered and not read on the native runtime", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    latestIsMerge();
    renderPalette();
    await act(async () => undefined);
    expect(requestLatestSplitOperation).not.toHaveBeenCalled();
    expect(screen.queryByRole("option", { name: /Undo merge/ })).toBeNull();
  });

  it("passes axe with the row shown", async () => {
    latestIsMerge();
    renderPalette(OTHER_ID);
    await undoMergeOption();
    await runAxe(document.body);
  });
});

describe("the Undo merge toast and the editor", () => {
  it("reports success in a dismissable role=status toast and shows the stored text of the open target", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue({
      ...MERGE_APPLIED,
      movedAnnotationIds: ["a1"],
    });
    const fake = makeFakeEditor(MERGED_TEXT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(TARGET_ID);
    renderPalette(TARGET_ID);
    await runUndoFromPalette();
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain(
      describeUndoMergeSuccess("Chapter 3", 2, 0, 1),
    );
    expect(status.textContent).toContain("Merge undone.");
    expect(status.textContent).toContain("2 other documents");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fake.loaded).toEqual([RESTORED_TEXT]);
    expect(fake.editable).toEqual([false, true]);
    expect(requestUndoSplit).toHaveBeenCalledTimes(1);
    expect(openProject).toHaveBeenCalledWith(PROJECT_DIR);
    expect(getSplitUndoAvailability().kind).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("shows the stored text of an open absorbed document too", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue(MERGE_APPLIED);
    const fake = makeFakeEditor(MERGED_TEXT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(ABSORBED_B);
    renderPalette(ABSORBED_B);
    await runUndoFromPalette();
    await screen.findByRole("status");
    expect(fake.loaded).toEqual([RESTORED_TEXT]);
  });

  it("leaves an unrelated open document as it is", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue(MERGE_APPLIED);
    const fake = makeFakeEditor(MERGED_TEXT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(OTHER_ID);
    renderPalette(OTHER_ID);
    await runUndoFromPalette();
    await screen.findByRole("status");
    expect(fake.loaded).toEqual([]);
    expect(fake.editable).toEqual([false, true]);
  });

  it("names the documents left alone, and an unknown target name", async () => {
    expect(describeUndoMergeSuccess(null, 2, 1, 0)).toContain(
      "The base document is back as it was",
    );
    expect(describeUndoMergeSuccess("X", 2, 1, 0)).toContain(
      "1 of them was in the Trash or permanently removed and was left alone",
    );
  });

  it("sends the pending saves before Undo and sends nothing when a save fails, with the cause in a role=alert toast", async () => {
    latestIsMerge();
    flushPendingSaves.mockResolvedValue(false);
    renderPalette();
    await runUndoFromPalette();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(UNDO_MERGE_SAVE_FAILED_MESSAGE);
    expect(requestUndoSplit).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reports a refusal's cause in a role=alert toast, dismissable, and nothing as status", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue({
      kind: "merge-refused",
      reason: "target-in-trash",
      message: MERGE_UNDO_REFUSAL_MESSAGES["target-in-trash"],
      documentId: TARGET_ID,
    });
    const fake = makeFakeEditor(MERGED_TEXT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(TARGET_ID);
    renderPalette();
    await runUndoFromPalette();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      MERGE_UNDO_REFUSAL_MESSAGES["target-in-trash"],
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(fake.editable).toEqual([false, true]);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("reports a failed Undo with the step and the state that remains, and holds the editor read-only unless the merge was restored", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue({
      kind: "merge-failed",
      failedStep: "clear-marks",
      remainingState: "marks-not-restored",
      cause: "Error",
    });
    const fake = makeFakeEditor(MERGED_TEXT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(TARGET_ID);
    renderPalette();
    await runUndoFromPalette();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      describeUndoMergeFailure("clear-marks", "marks-not-restored", "Error"),
    );
    expect(alert.textContent).toContain(UNDO_MERGE_EDITOR_HELD_MESSAGE);
    expect(fake.editable).toEqual([false]);
  });

  it("a failed Undo that put everything back does not hold the editor", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue({
      kind: "merge-failed",
      failedStep: "clear-record",
      remainingState: "merge-restored",
      cause: "Error",
    });
    const fake = makeFakeEditor(MERGED_TEXT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(TARGET_ID);
    renderPalette();
    await runUndoFromPalette();
    await screen.findByRole("alert");
    expect(fake.editable).toEqual([false, true]);
  });

  it("a transport failure says it is not known whether Undo ran", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue({
      kind: "failed",
      failedStep: null,
      remainingState: "state-unknown",
      cause: "transport-failed",
    });
    renderPalette();
    await runUndoFromPalette();
    expect((await screen.findByRole("alert")).textContent).toContain(
      UNDO_MERGE_TRANSPORT_FAILED_MESSAGE,
    );
  });

  it("reports a committed Undo whose index update failed as a success toast and an alert toast naming what was not updated", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue({
      ...MERGE_APPLIED,
      kind: "merge-index-failed",
      failures: [{ documentId: TARGET_ID, step: "inverted-index" }],
    });
    renderPalette();
    await runUndoFromPalette();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      describeUndoMergeIndexFailure(["inverted-index"]),
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Merge undone.",
    );
  });

  it("reports nothing-to-undo and could-not-be-checked in merge words when the offered action was a merge", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue({ kind: "nothing-to-undo" });
    renderPalette();
    await runUndoFromPalette();
    expect((await screen.findByRole("alert")).textContent).toContain(
      UNDO_MERGE_NOTHING_TO_UNDO_MESSAGE,
    );
    expect(getSplitUndoAvailability().kind).toBe("none");
  });

  it("reports could-not-be-checked for a merge in merge words", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue({
      kind: "could-not-be-checked",
      cause: "record-changed",
    });
    renderPalette();
    await runUndoFromPalette();
    expect((await screen.findByRole("alert")).textContent).toContain(
      UNDO_MERGE_COULD_NOT_BE_CHECKED_MESSAGE,
    );
  });

  it("reports a locked project in a role=alert toast", async () => {
    latestIsMerge();
    requestUndoSplit.mockRejectedValue(new ProjectLockedError(PROJECT_DIR));
    renderPalette();
    await runUndoFromPalette();
    expect((await screen.findByRole("alert")).textContent).toContain(
      UNDO_MERGE_LOCKED_MESSAGE,
    );
  });

  it("passes axe with a status toast and an alert toast shown", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue({
      ...MERGE_APPLIED,
      kind: "merge-index-failed",
      failures: [{ documentId: TARGET_ID, step: "backlinks" }],
    });
    renderPalette();
    await runUndoFromPalette();
    await screen.findByRole("alert");
    await runAxe(document.body);
  });
});

describe("UndoToastView", () => {
  it("is a role=alert element for a failure and role=status for a success, with a Dismiss button that calls back", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <UndoToastView
        kind="alert"
        messages={["x failed"]}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("x failed");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    rerender(<UndoToastView kind="status" messages={["done"]} />);
    expect(screen.getByRole("status").textContent).toBe("done");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Undo merge texts", () => {
  it("has a distinct non-empty text for every step and remaining state, and the failure text carries both", () => {
    const steps = Object.values(UNDO_MERGE_STEP_LABELS);
    const states = Object.values(UNDO_MERGE_REMAINING_STATE_MESSAGES);
    for (const list of [steps, states]) {
      for (const text of list) expect(text.trim().length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
    }
    expect(
      describeUndoMergeFailure("restore-target", "state-unknown", "Error"),
    ).toContain(UNDO_MERGE_STEP_LABELS["restore-target"]);
  });

  it("has distinct host constants and none equal to a refusal text", () => {
    const constants = [
      UNDO_MERGE_LABEL,
      UNDO_MERGE_READ_FAILED_MESSAGE,
      UNDO_MERGE_READ_LOCKED_MESSAGE,
      UNDO_MERGE_WORKING_MESSAGE,
      UNDO_MERGE_SAVE_FAILED_MESSAGE,
      UNDO_MERGE_LOCKED_MESSAGE,
      UNDO_MERGE_INVALID_REQUEST_MESSAGE,
      UNDO_MERGE_TRANSPORT_FAILED_MESSAGE,
      UNDO_MERGE_UNEXPECTED_FAILURE_MESSAGE,
      UNDO_MERGE_RELOAD_FAILED_MESSAGE,
      UNDO_MERGE_TREE_REFRESH_FAILED_MESSAGE,
      UNDO_MERGE_EDITOR_HELD_MESSAGE,
      UNDO_MERGE_NOTHING_TO_UNDO_MESSAGE,
      UNDO_MERGE_COULD_NOT_BE_CHECKED_MESSAGE,
    ];
    expect(new Set(constants).size).toBe(constants.length);
    for (const text of constants) {
      expect(Object.values(MERGE_UNDO_REFUSAL_MESSAGES)).not.toContain(text);
    }
  });
});

describe("Undo merge in the editor context menu", () => {
  const editors: Editor[] = [];

  function renderMenu() {
    const store = makeStore();
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: baseSchemaExtensions,
      content: "<p>Some document text</p>",
    });
    editors.push(editor);
    render(
      <Provider store={store}>
        <TrashRefreshProvider>
          <Toaster />
          <SplitUndoHost />
          <EditorContextMenu editor={editor}>
            <EditorContent editor={editor} data-testid="prosemirror" />
          </EditorContextMenu>
        </TrashRefreshProvider>
      </Provider>,
    );
    return { store, editor };
  }

  function openMenu(): void {
    fireEvent.contextMenu(screen.getByTestId("prosemirror"));
  }

  afterEach(() => {
    while (editors.length > 0) editors.pop()?.destroy();
  });

  it("appears while the latest operation is a merge, with an accessible name and a description naming the target and the number of absorbed documents", async () => {
    latestIsMerge();
    renderMenu();
    openMenu();
    const item = await screen.findByRole("menuitem", { name: "Undo merge" });
    expect(item.hasAttribute("data-disabled")).toBe(false);
    expect(item.textContent).toContain("Chapter 3");
    expect(item.textContent).toContain("2 other documents");
    expect(item.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Undo split" })).toBeNull();
  });

  it("is absent when the record is none", async () => {
    requestLatestSplitOperation.mockResolvedValue({ kind: "none" });
    renderMenu();
    openMenu();
    await waitFor(() => expect(requestLatestSplitOperation).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.queryByRole("menuitem", { name: "Undo merge" })).toBeNull();
  });

  it("a failed read shows a disabled item with its own message", async () => {
    requestLatestSplitOperation.mockResolvedValue({
      kind: "failed",
      cause: "transport-failed",
    });
    renderMenu();
    openMenu();
    const item = await screen.findByRole("menuitem", { name: "Undo merge" });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.textContent).toContain(UNDO_MERGE_READ_FAILED_MESSAGE);
  });

  it("is operable with the keyboard and sends Undo", async () => {
    latestIsMerge();
    requestUndoSplit.mockResolvedValue(MERGE_APPLIED);
    renderMenu();
    openMenu();
    const item = await screen.findByRole("menuitem", { name: "Undo merge" });
    act(() => item.focus());
    await act(async () => {
      fireEvent.keyDown(item, { key: "Enter" });
    });
    await waitFor(() =>
      expect(requestUndoSplit).toHaveBeenCalledWith(PROJECT_DIR),
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Merge undone.",
    );
  });

  it("is not offered and not read on the native runtime", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    latestIsMerge();
    renderMenu();
    openMenu();
    await act(async () => undefined);
    expect(requestLatestSplitOperation).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: "Undo merge" })).toBeNull();
  });

  it("passes axe with the item shown", async () => {
    latestIsMerge();
    renderMenu();
    openMenu();
    await screen.findByRole("menuitem", { name: "Undo merge" });
    await runAxe(document.body, ["region"]);
  });
});
