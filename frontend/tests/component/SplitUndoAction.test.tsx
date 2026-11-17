/**
 * Feature 120, Task 32 (FR-17, FR-18, FR-19): the "Undo split" action in the
 * command palette and the editor context menu, and the host that reads the
 * latest-operation record, runs Undo and reports it. jsdom only: the editor is
 * a stand-in object where the host reads it, and a real TipTap editor where the
 * menu needs one. Not evidence about a screen reader or a device.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
import {
  describeUndoSplitAction,
  describeUndoSplitFailure,
  describeUndoSplitIndexFailure,
  describeUndoSplitSuccess,
  UNDO_SPLIT_LABEL,
  UNDO_SPLIT_LOCKED_MESSAGE,
  UNDO_SPLIT_NOTHING_TO_UNDO_MESSAGE,
  UNDO_SPLIT_READ_FAILED_MESSAGE,
  UNDO_SPLIT_READ_LOCKED_MESSAGE,
  UNDO_SPLIT_REMAINING_STATE_MESSAGES,
  UNDO_SPLIT_SAVE_FAILED_MESSAGE,
  UNDO_SPLIT_TRANSPORT_FAILED_MESSAGE,
  UNDO_SPLIT_UNKNOWN_NAME_PHRASE,
} from "../../components/Split/splitUndoMessages";
import { SPLIT_UNDO_REFUSAL_MESSAGES } from "../../src/lib/models/split-messages";
import { ProjectLockedError } from "../../src/lib/models/crypto/locked-errors";
import type { AnyResource } from "../../src/lib/models/types";
import type { SplitUndoRemainingState } from "../../src/lib/models/split-undo-core";
import type { TipTapDocument } from "../../src/lib/models";
import { runAxe } from "../a11y/helpers/axe";

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
vi.mock("../../src/lib/api/resources", () => ({
  fetchResourceContent: (...args: unknown[]) => fetchResourceContent(...args),
  fetchRevisionContent: (...args: unknown[]) => fetchRevisionContent(...args),
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
const ORIGINAL_ID = "22222222-2222-4222-8222-222222222222";
const SPLIT_OFF_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";

function resource(id: string, name: string): AnyResource {
  return {
    id,
    name,
    type: "text",
    createdAt: "2026-01-01T00:00:00.000Z",
  } as AnyResource;
}

const ORIGINAL_DOC = resource(ORIGINAL_ID, "Chapter 3");
const SPLIT_OFF_DOC = resource(SPLIT_OFF_ID, "Chapter 3 (part 2)");
const OTHER_DOC = resource(OTHER_ID, "Unrelated notes");
const TREE: AnyResource[] = [ORIGINAL_DOC, SPLIT_OFF_DOC, OTHER_DOC];

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

const AFTER_SPLIT: TipTapDocument = {
  type: "doc",
  content: [p("First")],
} as TipTapDocument;
const RESTORED: TipTapDocument = {
  type: "doc",
  content: [p("First"), p("Second")],
} as TipTapDocument;

interface FakeEditor {
  editor: Editor;
  loaded: unknown[];
  editable: boolean[];
}

/** A stand-in for the live TipTap editor; the host reads only these members. */
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

const SPLIT_RECORD = {
  kind: "split",
  affectedDocumentIds: [ORIGINAL_ID, SPLIT_OFF_ID],
  snapshotRevisions: [],
  newDocumentId: SPLIT_OFF_ID,
  date: "2026-11-17T10:00:00.000Z",
};

function latestIsSplit(): void {
  requestLatestSplitOperation.mockResolvedValue({
    kind: "record",
    record: SPLIT_RECORD,
  });
}

const APPLIED = {
  kind: "applied" as const,
  originalDocumentId: ORIGINAL_ID,
  splitOffDocumentId: SPLIT_OFF_ID,
  splitOffState: "moved-to-trash" as const,
  preservedRevisions: [],
  movedAnnotationIds: [],
};

let stored: string;

interface PaletteProps {
  openResourceId?: string | null;
  resources?: AnyResource[];
  onClose?: () => void;
}

/** The palette as the shell mounts it: it closes itself on a selection, which releases the page the dialog hides. */
function PaletteHarness({
  resources,
  openResourceId,
  onClose,
}: {
  resources: AnyResource[];
  openResourceId: string | null;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = React.useState<boolean>(true);
  return (
    <>
      <SplitUndoHost />
      <button type="button" onClick={() => setIsOpen(true)}>
        reopen palette
      </button>
      <ResourceCommandPalette
        isOpen={isOpen}
        resources={resources}
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

function renderPalette(props: PaletteProps = {}) {
  const store = makeStore();
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <PaletteHarness
          resources={props.resources ?? TREE}
          openResourceId={props.openResourceId ?? null}
          onClose={onClose}
        />
      </TrashRefreshProvider>
    </Provider>,
  );
  return { store, onClose, ...utils };
}

async function undoOption(): Promise<HTMLElement> {
  return screen.findByRole("option", { name: /Undo split/ });
}

beforeEach(() => {
  stored = JSON.stringify(RESTORED);
  requestLatestSplitOperation.mockReset();
  requestUndoSplit.mockReset();
  flushPendingSaves.mockReset();
  flushPendingSaves.mockResolvedValue(true);
  fetchResourceContent.mockImplementation(async () => ({
    revisions: [{ id: "v-1", isCanonical: true }],
  }));
  fetchRevisionContent.mockImplementation(async () => stored);
  openProject.mockResolvedValue({ resources: TREE, folders: [] });
  setSplitUndoAvailability({ kind: "unknown" });
  vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "");
});

afterEach(() => {
  setActiveEditor(null);
  setActiveEditorResourceId(null);
  vi.unstubAllEnvs();
});

describe("Undo split in the command palette", () => {
  it("is absent when the latest-operation read returns none", async () => {
    requestLatestSplitOperation.mockResolvedValue({ kind: "none" });
    renderPalette();
    await waitFor(() =>
      expect(requestLatestSplitOperation).toHaveBeenCalledWith(PROJECT_DIR),
    );
    await act(async () => undefined);
    expect(screen.queryByRole("option", { name: /Undo split/ })).toBeNull();
  });

  it("is absent when the record is not a split", async () => {
    requestLatestSplitOperation.mockResolvedValue({
      kind: "record",
      record: { ...SPLIT_RECORD, kind: "merge" },
    });
    renderPalette();
    await waitFor(() => expect(requestLatestSplitOperation).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.queryByRole("option", { name: /Undo split/ })).toBeNull();
  });

  it("appears while the latest operation is a split, with an unrelated document open, naming the new document, the Trash and the kept edits", async () => {
    latestIsSplit();
    renderPalette({ openResourceId: OTHER_ID });
    const option = await undoOption();
    expect(option.textContent).toContain("Chapter 3 (part 2)");
    expect(option.textContent).toContain("Trash");
    expect(option.textContent).toContain("Edits made since the split are kept");
    expect(option.textContent).toBe(
      `${UNDO_SPLIT_LABEL}Action${describeUndoSplitAction("Chapter 3 (part 2)")}`,
    );
  });

  it("appears with no document open", async () => {
    latestIsSplit();
    renderPalette({ openResourceId: null });
    await undoOption();
  });

  it("is reachable after a reload: a fresh mount reads the stored record", async () => {
    latestIsSplit();
    const first = renderPalette();
    await undoOption();
    first.unmount();
    setSplitUndoAvailability({ kind: "unknown" });
    requestLatestSplitOperation.mockClear();
    renderPalette();
    await undoOption();
    expect(requestLatestSplitOperation).toHaveBeenCalledTimes(1);
  });

  it("is read again each time it opens, so a cleared record removes it", async () => {
    latestIsSplit();
    renderPalette();
    const option = await undoOption();
    requestUndoSplit.mockResolvedValue({ kind: "nothing-to-undo" });
    requestLatestSplitOperation.mockResolvedValue({ kind: "none" });
    await act(async () => {
      fireEvent.keyDown(screen.getByPlaceholderText("Search resources..."), {
        key: "Escape",
      });
    });
    void option;
    await act(async () => {
      fireEvent.click(screen.getByText("reopen palette"));
    });
    await waitFor(() => expect(getSplitUndoAvailability().kind).toBe("none"));
    expect(screen.queryByRole("option", { name: /Undo split/ })).toBeNull();
  });

  it("says what it does when the new document's name cannot be found in the project", async () => {
    latestIsSplit();
    renderPalette({ resources: [ORIGINAL_DOC, OTHER_DOC] });
    const option = await undoOption();
    expect(option.textContent).toContain(UNDO_SPLIT_UNKNOWN_NAME_PHRASE);
    expect(option.textContent).toContain("Trash");
  });

  it("a failed read shows its own message in a disabled row and does not read as no split", async () => {
    requestLatestSplitOperation.mockResolvedValue({
      kind: "failed",
      cause: "transport-failed",
    });
    renderPalette();
    const option = await undoOption();
    expect(option.getAttribute("aria-disabled")).toBe("true");
    expect(option.textContent).toContain(UNDO_SPLIT_READ_FAILED_MESSAGE);
    fireEvent.click(option);
    expect(requestUndoSplit).not.toHaveBeenCalled();
  });

  it("a thrown read of a locked project shows the locked read message", async () => {
    requestLatestSplitOperation.mockRejectedValue(
      new ProjectLockedError(PROJECT_DIR),
    );
    renderPalette();
    const option = await undoOption();
    expect(option.textContent).toContain(UNDO_SPLIT_READ_LOCKED_MESSAGE);
  });

  it("is operable with the keyboard from the search box and sends Undo for the project", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue(APPLIED);
    const { onClose } = renderPalette();
    await undoOption();
    const input = screen.getByPlaceholderText("Search resources...");
    fireEvent.change(input, { target: { value: "undo" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onClose).toHaveBeenCalled();
    await waitFor(() =>
      expect(requestUndoSplit).toHaveBeenCalledWith(PROJECT_DIR),
    );
  });

  it("is not offered and not read on the native runtime", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    latestIsSplit();
    renderPalette();
    await act(async () => undefined);
    expect(requestLatestSplitOperation).not.toHaveBeenCalled();
    expect(screen.queryByRole("option", { name: /Undo split/ })).toBeNull();
  });

  it("passes axe with the row shown", async () => {
    latestIsSplit();
    renderPalette({ openResourceId: OTHER_ID });
    await undoOption();
    await runAxe(document.body);
  });
});

async function runUndoFromPalette() {
  const option = await undoOption();
  await act(async () => {
    fireEvent.click(option);
  });
}

describe("Undo split report and editor", () => {
  it("reports success in a status region, leaves the alert region empty, and shows the stored document of the open original", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue({
      ...APPLIED,
      movedAnnotationIds: ["a1", "a2"],
    });
    const fake = makeFakeEditor(AFTER_SPLIT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(ORIGINAL_ID);
    renderPalette({ openResourceId: ORIGINAL_ID });
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Split undone."),
    );
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain("“Chapter 3 (part 2)” is now in the Trash.");
    expect(text).toContain("2 notes were put back");
    expect(text).toContain("Edits made since the split are kept");
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(fake.loaded).toEqual([RESTORED]);
    expect(fake.editable).toEqual([false, true]);
    expect(requestUndoSplit).toHaveBeenCalledTimes(1);
    expect(openProject).toHaveBeenCalledWith(PROJECT_DIR);
  });

  it("sends the pending saves before Undo, and sends nothing when a save fails", async () => {
    latestIsSplit();
    flushPendingSaves.mockResolvedValue(false);
    renderPalette();
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        UNDO_SPLIT_SAVE_FAILED_MESSAGE,
      ),
    );
    expect(requestUndoSplit).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("leaves an unrelated open document as it is after a successful Undo", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue(APPLIED);
    const fake = makeFakeEditor(AFTER_SPLIT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(OTHER_ID);
    renderPalette({ openResourceId: OTHER_ID });
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Split undone."),
    );
    expect(fake.loaded).toEqual([]);
    expect(fake.editable).toEqual([false, true]);
  });

  it("keeps the editor read-only when it shows the document that went to the Trash", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue(APPLIED);
    const fake = makeFakeEditor(AFTER_SPLIT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(SPLIT_OFF_ID);
    renderPalette({ openResourceId: SPLIT_OFF_ID });
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "read-only until you open another document",
      ),
    );
    expect(fake.editable).toEqual([false]);
  });

  it("reports a failed read-back of the original in the alert region and keeps the editor read-only", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue(APPLIED);
    fetchRevisionContent.mockResolvedValue(null);
    const fake = makeFakeEditor(AFTER_SPLIT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(ORIGINAL_ID);
    renderPalette({ openResourceId: ORIGINAL_ID });
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "could not be read back into the editor",
      ),
    );
    expect(fake.loaded).toEqual([]);
    expect(fake.editable).toEqual([false]);
  });

  it("reports a committed Undo with failed index updates as a success and an alert naming what was not updated", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue({
      ...APPLIED,
      kind: "index-failed",
      failures: [{ documentId: ORIGINAL_ID, step: "inverted-index" }],
    });
    renderPalette();
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        describeUndoSplitIndexFailure(["inverted-index"]),
      ),
    );
    expect(screen.getByRole("status").textContent).toContain("Split undone.");
  });

  it("reports a refusal's cause in the alert region, with the Task 10 text, and nothing in status", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue({
      kind: "refused",
      reason: "original-in-trash",
      message: SPLIT_UNDO_REFUSAL_MESSAGES["original-in-trash"],
    });
    const fake = makeFakeEditor(AFTER_SPLIT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(ORIGINAL_ID);
    renderPalette();
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        SPLIT_UNDO_REFUSAL_MESSAGES["original-in-trash"],
      ),
    );
    expect(screen.getByRole("status").textContent).toBe("");
    expect(fake.editable).toEqual([false, true]);
  });

  it("reports nothing-to-undo as its own alert and removes the action", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue({ kind: "nothing-to-undo" });
    renderPalette();
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        UNDO_SPLIT_NOTHING_TO_UNDO_MESSAGE,
      ),
    );
    expect(getSplitUndoAvailability().kind).toBe("none");
  });

  it("reports could-not-be-checked in the alert region", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue({
      kind: "could-not-be-checked",
      cause: "record-malformed",
    });
    renderPalette();
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "could not be checked",
      ),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Nothing was changed",
    );
  });

  it("reports a failed Undo with the step and the state that remains, and holds the editor read-only", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue({
      kind: "failed",
      failedStep: "trash-split-off",
      remainingState: "split-off-in-trash",
      cause: "Error",
    });
    const fake = makeFakeEditor(AFTER_SPLIT);
    setActiveEditor(fake.editor);
    setActiveEditorResourceId(ORIGINAL_ID);
    renderPalette();
    await runUndoFromPalette();
    await waitFor(() => {
      const alert = screen.getByRole("alert").textContent ?? "";
      expect(alert).toContain("stopped while moving the new document");
      expect(alert).toContain(
        UNDO_SPLIT_REMAINING_STATE_MESSAGES["split-off-in-trash"],
      );
    });
    expect(screen.getByRole("status").textContent).toBe("");
    expect(fake.editable).toEqual([false]);
  });

  it("a transport failure says it is not known whether Undo ran, never that the split is restored", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue({
      kind: "failed",
      failedStep: null,
      remainingState: "state-unknown",
      cause: "transport-failed",
    });
    renderPalette();
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        UNDO_SPLIT_TRANSPORT_FAILED_MESSAGE,
      ),
    );
  });

  it("reports a locked project in the alert region", async () => {
    latestIsSplit();
    requestUndoSplit.mockRejectedValue(new ProjectLockedError(PROJECT_DIR));
    renderPalette();
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        UNDO_SPLIT_LOCKED_MESSAGE,
      ),
    );
  });

  it("passes axe with a status and an alert shown", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue({
      ...APPLIED,
      kind: "index-failed",
      failures: [{ documentId: ORIGINAL_ID, step: "backlinks" }],
    });
    renderPalette();
    await runUndoFromPalette();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).not.toBe(""),
    );
    await runAxe(document.body);
  });
});

describe("Undo split texts", () => {
  const STATES: SplitUndoRemainingState[] = [
    "split-restored",
    "record-not-restored",
    "exclusion-not-restored",
    "split-off-in-trash",
    "notes-not-restored",
    "original-not-restored",
    "preserved-revisions-kept",
    "state-unknown",
  ];

  it("has one distinct text for each remaining state, and the failure text carries it", () => {
    const texts = STATES.map((s) => UNDO_SPLIT_REMAINING_STATE_MESSAGES[s]);
    expect(new Set(texts).size).toBe(STATES.length);
    for (const state of STATES) {
      expect(
        describeUndoSplitFailure("restore-original", state, "Error"),
      ).toContain(UNDO_SPLIT_REMAINING_STATE_MESSAGES[state]);
    }
  });

  it("states where the new document is for each split-off state", () => {
    expect(describeUndoSplitSuccess("X", "moved-to-trash", 0)).toContain(
      "is now in the Trash",
    );
    expect(describeUndoSplitSuccess("X", "was-in-trash", 0)).toContain(
      "already in the Trash",
    );
    expect(describeUndoSplitSuccess("X", "was-purged", 0)).toContain(
      "permanently removed",
    );
  });
});

describe("Undo split in the editor context menu", () => {
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

  it("appears while the latest operation is a split, with no document selected, naming the new document", async () => {
    latestIsSplit();
    renderMenu();
    openMenu();
    const item = await screen.findByRole("menuitem", { name: "Undo split" });
    expect(item.hasAttribute("data-disabled")).toBe(false);
    expect(item.textContent).toContain("Chapter 3 (part 2)");
    expect(item.textContent).toContain("Trash");
    expect(item.textContent).toContain("Edits made since the split are kept");
    expect(item.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("is absent when the record is none or not a split", async () => {
    requestLatestSplitOperation.mockResolvedValue({ kind: "none" });
    renderMenu();
    openMenu();
    await waitFor(() => expect(requestLatestSplitOperation).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.queryByRole("menuitem", { name: "Undo split" })).toBeNull();
  });

  it("a failed read shows a disabled item with its own message", async () => {
    requestLatestSplitOperation.mockResolvedValue({
      kind: "failed",
      cause: "transport-failed",
    });
    renderMenu();
    openMenu();
    const item = await screen.findByRole("menuitem", { name: "Undo split" });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.textContent).toContain(UNDO_SPLIT_READ_FAILED_MESSAGE);
  });

  it("is operable with the keyboard and sends Undo", async () => {
    latestIsSplit();
    requestUndoSplit.mockResolvedValue(APPLIED);
    renderMenu();
    openMenu();
    const item = await screen.findByRole("menuitem", { name: "Undo split" });
    act(() => item.focus());
    await act(async () => {
      fireEvent.keyDown(item, { key: "Enter" });
    });
    await waitFor(() =>
      expect(requestUndoSplit).toHaveBeenCalledWith(PROJECT_DIR),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("status")).queryByText(/Split undone/),
      ).not.toBeNull(),
    );
  });

  it("is not offered and not read on the native runtime", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    latestIsSplit();
    renderMenu();
    openMenu();
    await act(async () => undefined);
    expect(requestLatestSplitOperation).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: "Undo split" })).toBeNull();
  });

  it("passes axe with the item shown", async () => {
    latestIsSplit();
    renderMenu();
    openMenu();
    await screen.findByRole("menuitem", { name: "Undo split" });
    // The menu is a portal outside any landmark, as in EditorContextMenuSplit.
    await runAxe(document.body, ["region"]);
  });
});
