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
import MergeHost from "../../components/Merge/MergeHost";
import {
  openMergeDialog,
  type MergeOpenOutcome,
} from "../../components/Merge/mergeOpenRequest";
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
import { hashSplitContent } from "../../src/lib/api/split";
import { MERGE_REFUSAL_MESSAGES } from "../../src/lib/models/merge-messages";
import { MERGE_REFUSAL_REASONS } from "../../src/lib/models/merge-types";
import { ProjectLockedError } from "../../src/lib/models/crypto/locked-errors";
import type { TipTapDocument } from "../../src/lib/models";

const calls: string[] = [];
const requestMergePreview = vi.fn();
const requestMerge = vi.fn();
vi.mock("../../src/lib/api/merge", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/lib/api/merge")>();
  return {
    ...original,
    requestMergePreview: (...args: unknown[]) => requestMergePreview(...args),
    requestMerge: (...args: unknown[]) => requestMerge(...args),
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

const PROJECT_DIR = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REVISION: Record<string, string> = {
  [A]: "a0000000-0000-4000-8000-00000000000a",
  [B]: "b0000000-0000-4000-8000-00000000000b",
  [C]: "c0000000-0000-4000-8000-00000000000c",
  [OTHER]: "d0000000-0000-4000-8000-00000000000d",
};

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: { group: "inline" },
  },
});

function doc(text: string): TipTapDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  } as TipTapDocument;
}

interface FakeEditor {
  editor: Editor;
  loaded: Array<{ doc: unknown; options: unknown }>;
  metas: Array<[string, unknown]>;
  editable: boolean[];
}

/** A stand-in for the live TipTap editor; the host reads only these members. */
function makeEditor(initial: TipTapDocument): FakeEditor {
  let json = initial;
  const state = { doc: schema.nodeFromJSON(json), selection: { head: 1 } };
  const loaded: FakeEditor["loaded"] = [];
  const metas: FakeEditor["metas"] = [];
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
        setMeta: (key: string, value: unknown) => {
          metas.push([key, value]);
          return chain;
        },
        setContent: (next: TipTapDocument, options: unknown) => {
          loaded.push({ doc: next, options });
          json = next;
          state.doc = schema.nodeFromJSON(next);
          return chain;
        },
        run: () => true,
      };
      return chain;
    },
    commands: { setTextSelection: () => true, scrollIntoView: () => true },
  } as unknown as Editor;
  return { editor, loaded, metas, editable };
}

function previewData() {
  return {
    outcome: "preview" as const,
    target: { documentId: A, name: "Chapter A", folderPath: [], words: 2 },
    absorbed: [
      {
        documentId: B,
        name: "Chapter B",
        folderPath: [],
        words: 2,
        rules: ["It is left out of compile, in every format."],
      },
      {
        documentId: C,
        name: "Chapter C",
        folderPath: [],
        words: 2,
        rules: ["It is left out of compile, in every format."],
      },
    ],
    annotations: [],
    metadata: [],
    warnings: [],
  };
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
          <MergeHost unlock={unlock} />
        </StaticSharingLimitsProvider>
      </TrashRefreshProvider>
    </Provider>,
  );
  return { store, ...utils };
}

let stored: Record<string, string>;
let fake: FakeEditor;

function openEditorOn(resourceId: string, text: string) {
  fake = makeEditor(doc(text));
  setActiveEditor(fake.editor);
  setActiveEditorResourceId(resourceId);
}

function request(ids: string[] = [A, B, C]): MergeOpenOutcome {
  let outcome: MergeOpenOutcome = "no-host";
  act(() => {
    outcome = openMergeDialog(ids);
  });
  return outcome;
}

async function openAndWaitForDialog(ids: string[] = [A, B, C]) {
  expect(request(ids)).toBe("started");
  await screen.findByRole("button", { name: "Merge" });
}

beforeEach(() => {
  calls.length = 0;
  stored = {
    [A]: JSON.stringify(doc("Alpha text.")),
    [B]: JSON.stringify(doc("Beta text.")),
    [C]: JSON.stringify(doc("Gamma text.")),
    [OTHER]: JSON.stringify(doc("Other text.")),
  };
  fetchResourceContent.mockImplementation(
    async (_project: string, id: string) => {
      calls.push(`read-resource:${id}`);
      return { revisions: [{ id: REVISION[id], isCanonical: true }] };
    },
  );
  fetchRevisionContent.mockImplementation(async (id: string) => {
    calls.push(`read-revision:${id}`);
    return stored[id];
  });
  requestMergePreview.mockImplementation(async () => {
    calls.push("preview");
    return { kind: "preview", preview: previewData() };
  });
  requestMerge.mockImplementation(async () => {
    calls.push("merge");
    stored[A] = JSON.stringify(doc("Alpha text. Beta text. Gamma text."));
    return {
      kind: "applied",
      targetDocumentId: A,
      absorbedDocumentIds: [B, C],
      notices: [],
    };
  });
  openProject.mockResolvedValue({ resources: [], folders: [] });
});

afterEach(() => {
  setActiveEditor(null);
  setActiveEditorResourceId(null);
  vi.restoreAllMocks();
  requestMergePreview.mockReset();
  requestMerge.mockReset();
  fetchResourceContent.mockReset();
  fetchRevisionContent.mockReset();
  openProject.mockReset();
});

describe("MergeHost open request", () => {
  it("asks for at least two documents and sends nothing for fewer", () => {
    renderHost();
    expect(request([A])).toBe("too-few-documents");
    expect(request([])).toBe("too-few-documents");
    expect(requestMergePreview).not.toHaveBeenCalled();
    expect(fetchResourceContent).not.toHaveBeenCalled();
  });

  it("reports no host once the host is unmounted", () => {
    const { unmount } = renderHost();
    unmount();
    expect(request()).toBe("no-host");
  });

  it("ignores a second request while one is in progress", async () => {
    renderHost();
    await openAndWaitForDialog();
    expect(request()).toBe("busy");
    expect(requestMergePreview).toHaveBeenCalledTimes(1);
  });

  it("binds no key: mounting adds no keydown listener", () => {
    const onDocument = vi.spyOn(document, "addEventListener");
    const onWindow = vi.spyOn(window, "addEventListener");
    renderHost();
    const keyListeners = [...onDocument.mock.calls, ...onWindow.mock.calls]
      .map((c) => c[0])
      .filter((type) => type === "keydown" || type === "keyup");
    expect(keyListeners).toEqual([]);
    fireEvent.keyDown(document, { key: "m", metaKey: true, shiftKey: true });
    expect(requestMergePreview).not.toHaveBeenCalled();
  });
});

describe("MergeHost flush and request", () => {
  it("sends a pending save before the preview request, in that order", async () => {
    openEditorOn(A, "Alpha text.");
    let hasPending = true;
    const unregister = registerSaveFlusher("queued", () => {
      if (!hasPending) return;
      hasPending = false;
      calls.push("flush-save");
      trackSave(Promise.resolve(true));
    });
    renderHost();
    await openAndWaitForDialog();
    unregister();
    expect(calls.indexOf("flush-save")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("flush-save")).toBeLessThan(
      calls.indexOf("read-resource:" + A),
    );
    expect(calls.indexOf("flush-save")).toBeLessThan(calls.indexOf("preview"));
  });

  it("carries each document's canonical revision id and the shared content hash, in selection order", async () => {
    renderHost();
    await openAndWaitForDialog([B, A, C]);
    expect(requestMergePreview).toHaveBeenCalledTimes(1);
    const [projectId, body] = requestMergePreview.mock.calls[0] as [
      string,
      { documents: unknown[] },
    ];
    expect(projectId).toBe(PROJECT_DIR);
    expect(body.documents).toEqual(
      [B, A, C].map((id) => ({
        resourceId: id,
        revisionId: REVISION[id],
        contentHash: hashSplitContent(stored[id]),
      })),
    );
  });

  it("stops with a toast and no request when a pending save did not land", async () => {
    const error = vi
      .spyOn(toastService, "error")
      .mockImplementation(() => "id");
    const unregister = registerSaveFlusher("queued", () => {
      trackSave(Promise.resolve(false));
    });
    renderHost();
    expect(request()).toBe("started");
    await waitFor(() => expect(error).toHaveBeenCalled());
    unregister();
    expect(requestMergePreview).not.toHaveBeenCalled();
    expect(requestMerge).not.toHaveBeenCalled();
  });

  it("stops with a toast when a stored text cannot be read", async () => {
    const error = vi
      .spyOn(toastService, "error")
      .mockImplementation(() => "id");
    fetchRevisionContent.mockImplementation(async (id: string) =>
      id === B ? null : stored[id],
    );
    renderHost();
    expect(request()).toBe("started");
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(requestMergePreview).not.toHaveBeenCalled();
  });
});

describe("MergeHost stale outcome", () => {
  it("shows the stale message at the preview and changes nothing", async () => {
    openEditorOn(A, "Alpha text.");
    requestMergePreview.mockImplementation(async () => {
      calls.push("preview");
      return {
        kind: "stale",
        documentId: B,
        message: MERGE_REFUSAL_MESSAGES[MERGE_REFUSAL_REASONS.staleContent],
      };
    });
    renderHost();
    expect(request()).toBe("started");
    expect(
      await screen.findByText(
        MERGE_REFUSAL_MESSAGES[MERGE_REFUSAL_REASONS.staleContent],
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Merge" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(requestMerge).not.toHaveBeenCalled();
    expect(fake.loaded).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(fake.editable.at(-1)).toBe(true));
    expect(request()).toBe("started");
  });

  it("shows the stale message when the apply is refused as stale and loads nothing", async () => {
    openEditorOn(A, "Alpha text.");
    requestMerge.mockImplementation(async () => {
      calls.push("merge");
      return {
        kind: "stale",
        documentId: C,
        message: MERGE_REFUSAL_MESSAGES[MERGE_REFUSAL_REASONS.staleContent],
      };
    });
    renderHost();
    await openAndWaitForDialog();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(
      await screen.findByText(
        MERGE_REFUSAL_MESSAGES[MERGE_REFUSAL_REASONS.staleContent],
      ),
    ).toBeTruthy();
    expect(fake.loaded).toEqual([]);
  });

  it("refuses as stale, without a preview request, when the editor shows other text than is stored", async () => {
    openEditorOn(A, "Alpha text, edited but not saved.");
    renderHost();
    expect(request()).toBe("started");
    expect(
      await screen.findByText(
        MERGE_REFUSAL_MESSAGES[MERGE_REFUSAL_REASONS.staleContent],
      ),
    ).toBeTruthy();
    expect(requestMergePreview).not.toHaveBeenCalled();
  });
});

describe("MergeHost after a merge", () => {
  it("holds the editor read-only, writes no pre-merge autosave after the apply, and shows the stored text", async () => {
    openEditorOn(A, "Alpha text.");
    // An autosave waiting out its delay: it is sent by the flush, before the
    // merge. Nothing can be typed afterwards (read-only), so none is left.
    let pending: string | null = "pre-merge autosave";
    const unregister = registerSaveFlusher("queued", () => {
      if (pending === null) return;
      calls.push("autosave-write");
      pending = null;
      trackSave(Promise.resolve(true));
    });
    const success = vi
      .spyOn(toastService, "success")
      .mockImplementation(() => "id");
    renderHost();
    await openAndWaitForDialog();
    expect(fake.editable).toEqual([false]);
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    unregister();
    // The autosave went before the merge; none goes after it.
    expect(calls.filter((c) => c === "autosave-write")).toHaveLength(1);
    expect(calls.indexOf("autosave-write")).toBeLessThan(
      calls.indexOf("merge"),
    );
    await act(async () => {
      await flushPendingSaves();
    });
    expect(calls.slice(calls.indexOf("merge") + 1)).not.toContain(
      "autosave-write",
    );
    // The editor shows the stored text, outside the undo stack, and is released.
    expect(fake.loaded).toHaveLength(1);
    expect(fake.loaded[0].doc).toEqual(
      doc("Alpha text. Beta text. Gamma text."),
    );
    expect(fake.metas).toContainEqual(["addToHistory", false]);
    expect(fake.editable.at(-1)).toBe(true);
    expect(openProject).toHaveBeenCalledWith(PROJECT_DIR);
  });

  it("shows the stored state of the open document when it is an absorbed one, and does not open the target in its place", async () => {
    openEditorOn(B, "Beta text.");
    requestMerge.mockImplementation(async () => {
      calls.push("merge");
      stored[B] = JSON.stringify(doc("Beta text (marks stripped)."));
      return {
        kind: "applied",
        targetDocumentId: A,
        absorbedDocumentIds: [B, C],
        notices: [],
      };
    });
    const success = vi
      .spyOn(toastService, "success")
      .mockImplementation(() => "id");
    renderHost();
    await openAndWaitForDialog();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(fake.loaded).toHaveLength(1);
    expect(fake.loaded[0].doc).toEqual(doc("Beta text (marks stripped)."));
    expect(calls.filter((c) => c === `read-revision:${A}`).length).toBe(1); // only the pre-merge read of the target
  });

  it("leaves an editor showing a document outside the selection alone", async () => {
    openEditorOn(OTHER, "Other text.");
    const success = vi
      .spyOn(toastService, "success")
      .mockImplementation(() => "id");
    renderHost();
    await openAndWaitForDialog();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(fake.loaded).toEqual([]);
    expect(fake.editable).toEqual([]);
  });

  it("merges with no editor open", async () => {
    const success = vi
      .spyOn(toastService, "success")
      .mockImplementation(() => "id");
    renderHost();
    await openAndWaitForDialog();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(requestMerge).toHaveBeenCalledTimes(1);
  });

  it("sends the carry-over choice with the same documents as the preview", async () => {
    renderHost();
    await openAndWaitForDialog();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() => expect(requestMerge).toHaveBeenCalled());
    const [projectId, body] = requestMerge.mock.calls[0] as [
      string,
      { documents: unknown[]; carryOver: unknown },
    ];
    expect(projectId).toBe(PROJECT_DIR);
    expect(body.documents).toEqual(
      (requestMergePreview.mock.calls[0][1] as { documents: unknown[] })
        .documents,
    );
    expect(body.carryOver).toEqual({
      annotationIds: [],
      fields: [],
      unitedMultiselectFields: [],
    });
  });

  it("shows an index failure as a toast and still shows the stored text", async () => {
    openEditorOn(A, "Alpha text.");
    requestMerge.mockImplementation(async () => {
      calls.push("merge");
      stored[A] = JSON.stringify(doc("Alpha text. Beta text. Gamma text."));
      return {
        kind: "index-failed",
        targetDocumentId: A,
        absorbedDocumentIds: [B, C],
        notices: [],
        failures: [{ documentId: A, step: "inverted-index" }],
        message: "The merge was saved, but the index was not updated.",
      };
    });
    const error = vi
      .spyOn(toastService, "error")
      .mockImplementation(() => "id");
    vi.spyOn(toastService, "success").mockImplementation(() => "id");
    renderHost();
    await openAndWaitForDialog();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        "The merge was saved, but the index was not updated.",
      ),
    );
    expect(fake.loaded).toHaveLength(1);
  });

  it("shows a failed merge in the dialog, keeps it open and keeps the editor read-only", async () => {
    openEditorOn(A, "Alpha text.");
    requestMerge.mockImplementation(async () => ({
      kind: "failed",
      failedStep: "append-to-target",
      remainingState: "documents-restored",
      message: "The merge did not finish. Your documents are as they were.",
    }));
    renderHost();
    await openAndWaitForDialog();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(
      await screen.findByText(
        "The merge did not finish. Your documents are as they were.",
      ),
    ).toBeTruthy();
    expect(fake.loaded).toEqual([]);
  });
});

describe("MergeHost Cancel", () => {
  it("changes nothing and releases the editor", async () => {
    openEditorOn(A, "Alpha text.");
    renderHost();
    await openAndWaitForDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(fake.editable.at(-1)).toBe(true));
    expect(requestMerge).not.toHaveBeenCalled();
    expect(fake.loaded).toEqual([]);
  });
});

describe("MergeHost locked project", () => {
  it("opens the unlock prompt when a stored read hits a locked project, then goes on", async () => {
    const unlock = vi.fn().mockResolvedValue(undefined);
    let reads = 0;
    fetchResourceContent.mockImplementation(
      async (_project: string, id: string) => {
        reads += 1;
        if (reads === 1) throw new ProjectLockedError("locked");
        return { revisions: [{ id: REVISION[id], isCanonical: true }] };
      },
    );
    renderHost(unlock);
    expect(request()).toBe("started");
    const passphrase = await screen.findByLabelText(/passphrase/i);
    fireEvent.change(passphrase, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByRole("button", { name: "Merge" });
    expect(unlock).toHaveBeenCalledWith("secret");
    expect(requestMergePreview).toHaveBeenCalledTimes(1);
  });

  it("opens the unlock prompt when the preview hits a locked project, then retries once", async () => {
    const unlock = vi.fn().mockResolvedValue(undefined);
    let attempts = 0;
    requestMergePreview.mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) throw new ProjectLockedError("locked");
      return { kind: "preview", preview: previewData() };
    });
    renderHost(unlock);
    expect(request()).toBe("started");
    const passphrase = await screen.findByLabelText(/passphrase/i);
    fireEvent.change(passphrase, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByRole("button", { name: "Merge" });
    expect(attempts).toBe(2);
  });

  it("opens the unlock prompt when the merge hits a locked project and sends it again after unlocking", async () => {
    const unlock = vi.fn().mockResolvedValue(undefined);
    let attempts = 0;
    requestMerge.mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) throw new ProjectLockedError("locked");
      return {
        kind: "applied",
        targetDocumentId: A,
        absorbedDocumentIds: [B, C],
        notices: [],
      };
    });
    const success = vi
      .spyOn(toastService, "success")
      .mockImplementation(() => "id");
    renderHost(unlock);
    await openAndWaitForDialog();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    const passphrase = await screen.findByLabelText(/passphrase/i);
    fireEvent.change(passphrase, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(attempts).toBe(2);
  });

  it("ends with the locked message and no request when the unlock is declined", async () => {
    const error = vi
      .spyOn(toastService, "error")
      .mockImplementation(() => "id");
    fetchResourceContent.mockImplementation(async () => {
      throw new ProjectLockedError("locked");
    });
    renderHost();
    expect(request()).toBe("started");
    // The prompt is shown only when the limits read allows it; with the
    // static provider it is, and the writer closes it.
    await screen.findByLabelText(/passphrase/i);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue without unlocking" }),
    );
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        MERGE_REFUSAL_MESSAGES[MERGE_REFUSAL_REASONS.lockedProject],
      ),
    );
    expect(requestMergePreview).not.toHaveBeenCalled();
  });
});
