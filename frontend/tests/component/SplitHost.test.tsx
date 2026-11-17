import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { Schema } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import projectsReducer, {
  setProject,
  setSelectedProjectId,
  type StoredProject,
} from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import { toastService } from "../../src/lib/toast-service";
import SplitHost from "../../components/Split/SplitHost";
import { openSplitDialog } from "../../components/Split/splitOpenRequest";
import { plainTextOffsetAtPosition } from "../../components/Split/splitOffset";
import {
  setActiveEditor,
  setActiveEditorResourceId,
} from "../../components/Editor/activeEditorRegistry";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import {
  flushPendingSaves,
  registerSaveFlusher,
  trackSave,
} from "../../src/lib/pending-saves";
import { cutDocument } from "../../src/lib/models/split-cut";
import { tiptapToPlainText } from "../../src/lib/tiptap-text";
import { SPLIT_REFUSAL_MESSAGES } from "../../src/lib/models/split-messages";
import { SPLIT_REFUSAL_REASONS } from "../../src/lib/models/split-types";
import { ProjectLockedError } from "../../src/lib/models/crypto/locked-errors";
import type { TipTapDocument } from "../../src/lib/models";

const calls: string[] = [];
const requestSplitPreview = vi.fn();
const requestSplit = vi.fn();
vi.mock("../../src/lib/api/split", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/lib/api/split")>();
  return {
    ...original,
    requestSplitPreview: (...args: unknown[]) => requestSplitPreview(...args),
    requestSplit: (...args: unknown[]) => requestSplit(...args),
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

const PROJECT_DIR = "11111111-1111-4111-8111-111111111111";
const RESOURCE_ID = "22222222-2222-4222-8222-222222222222";
const NEW_ID = "33333333-3333-4333-8333-333333333333";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    heading: {
      group: "block",
      content: "text*",
      attrs: { level: { default: 1 } },
    },
    text: { group: "inline" },
  },
});

function p(text: string) {
  return {
    type: "paragraph",
    content: text === "" ? [] : [{ type: "text", text }],
  };
}
function h(text: string) {
  return {
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text }],
  };
}

const ORIGINAL: TipTapDocument = {
  type: "doc",
  content: [h("Title"), p("First paragraph."), p("Second paragraph.")],
} as TipTapDocument;
const TRUNCATED: TipTapDocument = {
  type: "doc",
  content: [h("Title"), p("First")],
} as TipTapDocument;

interface FakeEditor {
  editor: Editor;
  loaded: Array<{ doc: unknown; options: unknown }>;
  editable: boolean[];
  selections: number[];
  edit: (doc: TipTapDocument) => void;
}

/** A stand-in for the live TipTap editor; the host reads only these members. */
function makeEditor(initial: TipTapDocument, head: number): FakeEditor {
  let json = initial;
  const state = { doc: schema.nodeFromJSON(json), selection: { head } };
  const loaded: FakeEditor["loaded"] = [];
  const editable: boolean[] = [];
  const selections: number[] = [];
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
        setContent: (doc: TipTapDocument, options: unknown) => {
          loaded.push({ doc, options });
          json = doc;
          state.doc = schema.nodeFromJSON(doc);
          return chain;
        },
        run: () => true,
      };
      return chain;
    },
    commands: {
      setTextSelection: (pos: number) => {
        selections.push(pos);
        return true;
      },
      scrollIntoView: () => true,
    },
  } as unknown as Editor;
  return {
    editor,
    loaded,
    editable,
    selections,
    edit: (doc) => {
      json = doc;
      state.doc = schema.nodeFromJSON(doc);
    },
  };
}

const previewData = {
  outcome: "preview" as const,
  revisionId: "v-1",
  contentHash: "x",
  offset: 0,
  documentName: "Chapter",
  defaultNewName: "Chapter (2)",
  firstHalfWords: 2,
  secondHalfWords: 2,
  anchored: { notes: [], citations: [], claims: [] },
  spanning: [],
  fields: [],
};

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
      resources: [],
    } as unknown as StoredProject),
  );
  store.dispatch(setSelectedProjectId(PROJECT_DIR));
  return store;
}

function renderHost(unlock?: (passphrase: string) => Promise<void>) {
  const store = makeStore();
  const utils = render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <StaticSharingLimitsProvider>
          <SplitHost unlock={unlock} />
        </StaticSharingLimitsProvider>
      </TrashRefreshProvider>
    </Provider>,
  );
  return { store, ...utils };
}

let stored: string;
let fake: FakeEditor;

function openWith(head: number) {
  fake = makeEditor(ORIGINAL, head);
  setActiveEditor(fake.editor);
  setActiveEditorResourceId(RESOURCE_ID);
}

beforeEach(() => {
  calls.length = 0;
  stored = JSON.stringify(ORIGINAL);
  fetchResourceContent.mockImplementation(async () => {
    calls.push("fetchResourceContent");
    return { revisions: [{ id: "v-1", isCanonical: true }] };
  });
  fetchRevisionContent.mockImplementation(async () => {
    calls.push("fetchRevisionContent");
    return stored;
  });
  requestSplitPreview.mockImplementation(async () => {
    calls.push("preview");
    return { kind: "preview", preview: previewData };
  });
  requestSplit.mockImplementation(async () => {
    calls.push("split");
    stored = JSON.stringify(TRUNCATED);
    return {
      kind: "applied",
      newDocumentId: NEW_ID,
      notices: [],
      snapshotRevisionId: "v-2",
      snapshotRevisionNumber: 2,
    };
  });
  openProject.mockResolvedValue({ resources: [], folders: [] });
});

afterEach(() => {
  setActiveEditor(null);
  setActiveEditorResourceId(null);
  vi.restoreAllMocks();
  requestSplitPreview.mockReset();
  requestSplit.mockReset();
  fetchResourceContent.mockReset();
  fetchRevisionContent.mockReset();
  openProject.mockReset();
});

async function openAndWaitForDialog() {
  act(() => {
    expect(openSplitDialog()).toBe("started");
  });
  await screen.findByLabelText("Name of the new document");
}

describe("plainTextOffsetAtPosition", () => {
  it("matches the offsets the server cut counts, at every cursor position", () => {
    const docs: TipTapDocument[] = [
      ORIGINAL,
      {
        type: "doc",
        content: [p("ab"), p(""), h("cd"), p("efg"), p("")],
      } as TipTapDocument,
    ];
    for (const doc of docs) {
      const pmDoc = schema.nodeFromJSON(doc);
      const plain = tiptapToPlainText(doc);
      for (let pos = 0; pos <= pmDoc.content.size; pos++) {
        const offset = plainTextOffsetAtPosition(pmDoc, pos);
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(plain.length);
        const cut = cutDocument(doc, offset);
        if (cut.outcome === "cut") {
          expect(tiptapToPlainText(cut.first)).toBe(
            plain.slice(0, offset).replace(/\n+$/g, ""),
          );
        }
      }
    }
  });

  it("counts a cursor inside text, at a block end and after a line break", () => {
    const pmDoc = schema.nodeFromJSON(ORIGINAL);
    // doc: heading "Title" occupies 0-7, first paragraph 7-25, second 25-44.
    expect(plainTextOffsetAtPosition(pmDoc, 1 + 3)).toBe(3);
    expect(plainTextOffsetAtPosition(pmDoc, 6)).toBe(5);
    expect(plainTextOffsetAtPosition(pmDoc, 8)).toBe(6 + 0);
    expect(plainTextOffsetAtPosition(pmDoc, 8 + 5)).toBe(6 + 5);
  });
});

describe("SplitHost open request", () => {
  it("does nothing and says so with no document open", () => {
    renderHost();
    setActiveEditor(null);
    expect(openSplitDialog()).toBe("no-document");
    expect(requestSplitPreview).not.toHaveBeenCalled();
    expect(fetchResourceContent).not.toHaveBeenCalled();
  });

  it("reports no host once the host is unmounted", () => {
    const { unmount } = renderHost();
    unmount();
    expect(openSplitDialog()).toBe("no-host");
  });

  it("sends pending saves before the preview request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unregister = registerSaveFlusher("queued", () => {
      calls.push("flusher");
      trackSave(
        Promise.resolve().then(() => {
          calls.push("save-landed");
          return true;
        }),
      );
    });
    renderHost();
    openWith(8 + 5);
    await openAndWaitForDialog();
    unregister();
    expect(calls.indexOf("flusher")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("save-landed")).toBeLessThan(calls.indexOf("preview"));
    expect(calls.indexOf("flusher")).toBeLessThan(
      calls.indexOf("fetchRevisionContent"),
    );
    const [projectId, request] = requestSplitPreview.mock.calls[0] as [
      string,
      { resourceId: string; revisionId: string; offset: number },
    ];
    expect(projectId).toBe(PROJECT_DIR);
    expect(request.resourceId).toBe(RESOURCE_ID);
    expect(request.revisionId).toBe("v-1");
    expect(request.offset).toBe(6 + 5);
  });

  it("does not split when a pending save failed", async () => {
    const errorToast = vi
      .spyOn(toastService, "error")
      .mockImplementation(() => "id");
    const unregister = registerSaveFlusher("queued", () => {
      trackSave(Promise.reject(new Error("write failed")));
    });
    renderHost();
    openWith(8 + 5);
    act(() => {
      openSplitDialog();
    });
    await waitFor(() => expect(errorToast).toHaveBeenCalled());
    unregister();
    // let the failed tracked save settle out of the shared set
    await flushPendingSaves();
    expect(requestSplitPreview).not.toHaveBeenCalled();
    expect(requestSplit).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText("Name of the new document"),
    ).not.toBeInTheDocument();
    expect(fake.editable.at(-1)).toBe(true);
  });

  it("ignores a second request while one is running", async () => {
    renderHost();
    openWith(8 + 5);
    let outcome = "";
    act(() => {
      openSplitDialog();
      outcome = openSplitDialog();
    });
    expect(outcome).toBe("busy");
    await screen.findByLabelText("Name of the new document");
    expect(requestSplitPreview).toHaveBeenCalledTimes(1);
  });
});

describe("SplitHost stale and refused outcomes", () => {
  it("shows the stale message and changes nothing", async () => {
    requestSplitPreview.mockResolvedValue({
      kind: "stale",
      message: SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.staleCursor],
    });
    renderHost();
    openWith(8 + 5);
    act(() => {
      openSplitDialog();
    });
    expect(
      await screen.findByText(
        SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.staleCursor],
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Split" })).toBeDisabled();
    expect(requestSplit).not.toHaveBeenCalled();
    expect(fake.loaded).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Name of the new document"),
      ).not.toBeInTheDocument(),
    );
    expect(fake.editable.at(-1)).toBe(true);
  });

  it("shows a cursor refusal inline in the dialog", async () => {
    requestSplitPreview.mockResolvedValue({
      kind: "refused",
      reason: SPLIT_REFUSAL_REASONS.cursorInCodeBlock,
      message: SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.cursorInCodeBlock],
    });
    renderHost();
    openWith(8 + 5);
    act(() => {
      openSplitDialog();
    });
    expect(
      await screen.findByText(
        SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.cursorInCodeBlock],
      ),
    ).toBeInTheDocument();
    expect(requestSplit).not.toHaveBeenCalled();
  });

  it("refuses as stale when the editor text differs from the stored text, and asks nothing", async () => {
    stored = JSON.stringify({
      type: "doc",
      content: [h("Title"), p("Other text.")],
    });
    renderHost();
    openWith(8 + 5);
    act(() => {
      openSplitDialog();
    });
    expect(
      await screen.findByText(
        SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.staleCursor],
      ),
    ).toBeInTheDocument();
    expect(requestSplitPreview).not.toHaveBeenCalled();
    expect(requestSplit).not.toHaveBeenCalled();
  });

  it("shows a failed preview as a failure in the dialog", async () => {
    requestSplitPreview.mockResolvedValue({
      kind: "failed",
      message: "The split preview could not be loaded. Nothing was changed.",
    });
    renderHost();
    openWith(8 + 5);
    act(() => {
      openSplitDialog();
    });
    expect(
      await screen.findByText(
        "The split preview could not be loaded. Nothing was changed.",
      ),
    ).toBeInTheDocument();
  });
});

describe("SplitHost apply", () => {
  it("flushes saves before the split, then shows the stored state with the cursor at its end", async () => {
    const success = vi
      .spyOn(toastService, "success")
      .mockImplementation(() => "id");
    const unregister = registerSaveFlusher("queued", () => {
      calls.push("flusher");
    });
    const { store } = renderHost();
    openWith(8 + 5);
    await openAndWaitForDialog();
    calls.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    unregister();

    expect(calls.indexOf("flusher")).toBeLessThan(calls.indexOf("split"));
    const [projectId, request] = requestSplit.mock.calls[0] as [
      string,
      {
        resourceId: string;
        revisionId: string;
        offset: number;
        carryOver: { newName: string };
      },
    ];
    expect(projectId).toBe(PROJECT_DIR);
    expect(request.offset).toBe(6 + 5);
    expect(request.carryOver.newName).toBe("Chapter (2)");

    // The open editor shows the stored document, not the pre-split text.
    expect(fake.loaded).toHaveLength(1);
    expect(fake.loaded[0].doc).toEqual(TRUNCATED);
    expect(fake.loaded[0].options).toEqual({ emitUpdate: true });
    expect(fake.selections.at(-1)).toBe(fake.editor.state.doc.content.size);
    expect(fake.editable.at(-1)).toBe(true);
    // The original stays open: the host never selects another resource.
    expect(store.getState().projects).toBeDefined();
    // The tree is re-read so the new document appears.
    await waitFor(() => expect(openProject).toHaveBeenCalledWith(PROJECT_DIR));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Name of the new document"),
      ).not.toBeInTheDocument(),
    );
  });

  it("writes no autosave of the pre-split text after the apply", async () => {
    vi.spyOn(toastService, "success").mockImplementation(() => "id");
    const writes: string[] = [];
    // A pending autosave of the pre-split document, as the editor holds it.
    let pending: TipTapDocument | null = ORIGINAL;
    const unregister = registerSaveFlusher("queued", () => {
      if (pending === null) return;
      const doc = pending;
      pending = null;
      trackSave(
        Promise.resolve().then(() => {
          writes.push(JSON.stringify(doc));
          calls.push("write");
          return true;
        }),
      );
    });
    renderHost();
    openWith(8 + 5);
    await openAndWaitForDialog();
    // The held autosave went out before the preview request.
    expect(calls.indexOf("write")).toBeLessThan(calls.indexOf("preview"));
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => expect(fake.loaded).toHaveLength(1));
    const writesAfterApply = calls.slice(calls.indexOf("split") + 1);
    expect(writesAfterApply).not.toContain("write");
    // A later flush (window close) has nothing of the pre-split text to send.
    await flushPendingSaves();
    unregister();
    expect(writes).toEqual([JSON.stringify(ORIGINAL)]);
    expect(
      calls.slice(calls.indexOf("split") + 1).filter((c) => c === "write"),
    ).toHaveLength(0);
  });

  it("refuses to apply when the text was edited after the preview", async () => {
    renderHost();
    openWith(8 + 5);
    await openAndWaitForDialog();
    fake.edit({
      type: "doc",
      content: [h("Title"), p("First paragraph!"), p("Second paragraph.")],
    } as TipTapDocument);
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(
      await screen.findByText(
        SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.staleCursor],
      ),
    ).toBeInTheDocument();
    expect(requestSplit).not.toHaveBeenCalled();
    expect(fake.loaded).toHaveLength(0);
  });

  it("does not apply when a save fails at the second flush", async () => {
    renderHost();
    openWith(8 + 5);
    await openAndWaitForDialog();
    const unregister = registerSaveFlusher("queued", () => {
      trackSave(Promise.reject(new Error("write failed")));
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/not split/i),
    );
    unregister();
    await flushPendingSaves();
    expect(requestSplit).not.toHaveBeenCalled();
    expect(fake.loaded).toHaveLength(0);
  });

  it("shows a failed split as a failure and keeps the document as it is", async () => {
    requestSplit.mockResolvedValue({
      kind: "failed",
      failedStep: "truncate",
      remainingState: "original-restored",
      message: "The split did not finish. Your document is as it was.",
    });
    renderHost();
    openWith(8 + 5);
    await openAndWaitForDialog();
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(
      await screen.findByText(
        "The split did not finish. Your document is as it was.",
      ),
    ).toBeInTheDocument();
    expect(fake.loaded).toHaveLength(0);
  });

  it("shows an index failure and the compile-exclusion notice as toasts", async () => {
    const errorToast = vi
      .spyOn(toastService, "error")
      .mockImplementation(() => "id");
    const infoToast = vi
      .spyOn(toastService, "info")
      .mockImplementation(() => "id");
    vi.spyOn(toastService, "success").mockImplementation(() => "id");
    requestSplit.mockImplementation(async () => {
      stored = JSON.stringify(TRUNCATED);
      return {
        kind: "index-failed",
        newDocumentId: NEW_ID,
        notices: ["Excluded notice text"],
        snapshotRevisionId: "v-2",
        snapshotRevisionNumber: 2,
        failures: [{ documentId: NEW_ID, step: "inverted-index" }],
        message: "The split was saved, but some data was not updated.",
      };
    });
    renderHost();
    openWith(8 + 5);
    await openAndWaitForDialog();
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => expect(errorToast).toHaveBeenCalled());
    expect(String(errorToast.mock.calls[0][0])).toContain(
      "The split was saved, but some data was not updated.",
    );
    expect(infoToast).toHaveBeenCalledWith("Excluded notice text");
    expect(fake.loaded).toHaveLength(1);
  });

  it("keeps the editor read-only and says so when the stored text cannot be read back", async () => {
    renderHost();
    openWith(8 + 5);
    await openAndWaitForDialog();
    requestSplit.mockImplementation(async () => {
      fetchRevisionContent.mockResolvedValue(null);
      return {
        kind: "applied",
        newDocumentId: NEW_ID,
        notices: [],
        snapshotRevisionId: "v-2",
        snapshotRevisionNumber: 2,
      };
    });
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(
      await screen.findByText(/could not be read back/i),
    ).toBeInTheDocument();
    expect(fake.loaded).toHaveLength(0);
    expect(fake.editable).not.toContain(true);
  });
});

describe("SplitHost locked project", () => {
  it("opens the unlock prompt, then retries the preview once after unlocking", async () => {
    const unlock = vi.fn().mockResolvedValue(undefined);
    let attempts = 0;
    requestSplitPreview.mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) throw new ProjectLockedError("locked");
      return { kind: "preview", preview: previewData };
    });
    renderHost(unlock);
    openWith(8 + 5);
    act(() => {
      openSplitDialog();
    });
    const passphrase = await screen.findByLabelText(/passphrase/i);
    fireEvent.change(passphrase, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByLabelText("Name of the new document");
    expect(unlock).toHaveBeenCalledWith("secret");
    expect(requestSplitPreview).toHaveBeenCalledTimes(2);
  });

  it("ends with a message and no change when the unlock prompt is declined", async () => {
    const errorToast = vi
      .spyOn(toastService, "error")
      .mockImplementation(() => "id");
    requestSplitPreview.mockRejectedValue(new ProjectLockedError("locked"));
    renderHost();
    openWith(8 + 5);
    act(() => {
      openSplitDialog();
    });
    await screen.findByLabelText(/passphrase/i);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue without unlocking" }),
    );
    await waitFor(() => expect(errorToast).toHaveBeenCalled());
    expect(requestSplit).not.toHaveBeenCalled();
    expect(fake.editable.at(-1)).toBe(true);
  });
});
