/** @vitest-environment jsdom */
/**
 * Feature 103, Task 30 (FR-23): a text excerpt of a Source whose passage is
 * lost (edited away, deleted, or absent after a revision restore) is kept,
 * derived as not found (detached) from the document marks, shown with its
 * saved quote, and can be re-attached or deleted. Detached state is derived
 * in the panel from the editor document; nothing about it is written.
 *
 * These tests characterise unchanged behaviour (no product change).
 */
import React from "react";
import path from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { Harness, makeHandle } from "../helpers/annotations-panel-harness";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import AnnotationHighlightExtension from "../../components/Editor/Extensions/AnnotationHighlightExtension";
import { collectAnnotationRanges } from "../../components/Editor/Annotations/annotation-doc";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { readFile, setStorageAdapter } from "../../src/lib/models/io";
import { generateUUID } from "../../src/lib/models/uuid";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { createRevision } from "../../src/lib/models/revision-manager";
import { setCanonicalRevision } from "../../src/lib/models/revision-core";
import { listRevisions, revisionDir } from "../../src/lib/models/revision";
import {
  canReattachAnnotation,
  isDetachedAnnotation,
} from "../../src/lib/models/excerpts";
import type {
  Annotation,
  AnyResource,
  MetadataValue,
} from "../../src/lib/models/types";

vi.mock("../../src/lib/api/trash", () => ({
  listTrash: vi
    .fn()
    .mockResolvedValue({ resources: [], folders: [], attachments: [] }),
}));
vi.mock("../../src/lib/api/source-attachments", () => ({
  listAttachments: vi.fn().mockResolvedValue([]),
}));

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const EXCERPT_ID = "excerpt-1";
const QUOTE = "the quoted passage";

const EXCERPT: Annotation = {
  id: EXCERPT_ID,
  body: "why it matters",
  quote: QUOTE,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  target: { sourceId: SOURCE_ID, locator: { value: "p. 4" } },
};

function sourceDoc(withMark: boolean): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Before " },
          {
            type: "text",
            text: QUOTE,
            ...(withMark
              ? { marks: [{ type: "annotation", attrs: { id: EXCERPT_ID } }] }
              : {}),
          },
          { type: "text", text: " after." },
        ],
      },
    ],
  };
}

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

function makeSourceEditor(withMark: boolean): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [...baseSchemaExtensions, AnnotationHighlightExtension],
    content: sourceDoc(withMark),
  });
  editors.push(editor);
  return editor;
}

function renderPanel(editor: Editor): ReturnType<typeof makeHandle> {
  const handle = makeHandle({ status: "ok", annotations: [EXCERPT] });
  const store = makeStore();
  store.dispatch(
    setProject({ id: "p1", name: "P", rootPath: "/tmp/projects/dir-1" }),
  );
  store.dispatch(setSelectedProjectId("p1"));
  store.dispatch(
    setResources([
      {
        id: SOURCE_ID,
        slug: "s",
        name: "Source",
        type: "source",
        orderIndex: 0,
      } as AnyResource,
    ]),
  );
  render(
    <Provider store={store}>
      <Harness editor={editor} handle={handle} />
    </Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
  return handle;
}

function row(): HTMLElement {
  return screen.getByTestId("annotation-item");
}

function expectNotFoundWithSavedText(): void {
  expect(row()).toHaveAttribute("data-detached", "true");
  expect(
    screen.getByRole("list", { name: "Detached annotations" }),
  ).toBeInTheDocument();
  expect(row()).toHaveTextContent(`Saved quote: ${QUOTE}`);
  expect(row()).toHaveTextContent("why it matters");
  expect(
    within(row()).getByRole("button", { name: /re-attach/i }),
  ).toBeInTheDocument();
  expect(
    within(row()).getByRole("button", { name: "Delete note" }),
  ).toBeEnabled();
}

function passageRange(editor: Editor): { from: number; to: number } {
  const range = collectAnnotationRanges(editor.state.doc).get(EXCERPT_ID);
  if (!range) throw new Error("passage has no mark");
  return { from: range.from, to: range.to };
}

describe("excerpt whose passage is intact (contrast)", () => {
  it("is not detached: shown as attached with Show in text and no Re-attach", () => {
    renderPanel(makeSourceEditor(true));
    expect(row()).toHaveAttribute("data-detached", "false");
    expect(row()).toHaveTextContent(`On: ${QUOTE}`);
    expect(
      within(row()).queryByRole("button", { name: /re-attach/i }),
    ).toBeNull();
    expect(
      within(row()).getByRole("button", { name: "Show in text" }),
    ).toBeInTheDocument();
    expect(isDetachedAnnotation(EXCERPT, true)).toBe(false);
  });
});

describe("edit of the passage (FR-23)", () => {
  it("replacing the marked text drops the mark; the excerpt is kept, not found, with its quote", () => {
    const editor = makeSourceEditor(true);
    const handle = renderPanel(editor);
    expect(row()).toHaveAttribute("data-detached", "false");
    const { from, to } = passageRange(editor);
    act(() => {
      editor
        .chain()
        .setTextSelection({ from, to })
        .deleteSelection()
        .insertContent("a different wording")
        .run();
    });
    expect(editor.getText()).toContain("a different wording");
    expect(collectAnnotationRanges(editor.state.doc).has(EXCERPT_ID)).toBe(
      false,
    );
    expectNotFoundWithSavedText();
    expect(handle.remove).not.toHaveBeenCalled();
    expect(handle.update).not.toHaveBeenCalled();
  });

  it("re-attach sends the writer's current selection for the kept excerpt", () => {
    const editor = makeSourceEditor(true);
    const handle = renderPanel(editor);
    const { from, to } = passageRange(editor);
    act(() => {
      editor
        .chain()
        .setTextSelection({ from, to })
        .deleteSelection()
        .insertContent("a different wording")
        .run();
    });
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 7 });
    });
    fireEvent.click(within(row()).getByRole("button", { name: /re-attach/i }));
    expect(handle.reattach).toHaveBeenCalledWith(EXCERPT_ID, {
      from: 1,
      to: 7,
    });
  });
});

describe("deletion of the passage (FR-23)", () => {
  it("deleting the marked text keeps the excerpt, not found, with its quote", () => {
    const editor = makeSourceEditor(true);
    const handle = renderPanel(editor);
    const { from, to } = passageRange(editor);
    act(() => {
      editor.chain().deleteRange({ from, to }).run();
    });
    expect(editor.getText()).not.toContain(QUOTE);
    expectNotFoundWithSavedText();
    expect(handle.remove).not.toHaveBeenCalled();
  });

  it("the not-found excerpt can then be deleted, after confirmation", async () => {
    const editor = makeSourceEditor(true);
    const handle = renderPanel(editor);
    const { from, to } = passageRange(editor);
    act(() => {
      editor.chain().deleteRange({ from, to }).run();
    });
    fireEvent.click(within(row()).getByRole("button", { name: "Delete note" }));
    expect(handle.remove).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Delete note" }),
      );
    });
    expect(handle.remove).toHaveBeenCalledWith(EXCERPT_ID);
  });
});

describe("revision restore (FR-23)", () => {
  const projectRoot = "/proj-excerpt-restore";

  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  async function seedAndRestore(
    revisionWithMark: boolean,
  ): Promise<{ restored: JSONContent; sidecarBefore: string }> {
    const resourceId = generateUUID();
    const sidecar: Record<string, MetadataValue> = {
      id: resourceId,
      name: "Source",
      type: "source",
      annotations: [EXCERPT] as unknown as MetadataValue,
    };
    await writeSidecar(projectRoot, resourceId, sidecar);
    await createRevision(
      projectRoot,
      resourceId,
      JSON.stringify(sourceDoc(revisionWithMark)),
      { isCanonical: false },
    );
    await createRevision(
      projectRoot,
      resourceId,
      JSON.stringify(sourceDoc(true)),
      { isCanonical: true },
    );
    const sidecarBefore = JSON.stringify(
      (await readSidecar(projectRoot, resourceId))!.annotations,
    );
    const target = (await listRevisions(projectRoot, resourceId)).find(
      (r) => r.versionNumber === 1,
    )!;
    await setCanonicalRevision(projectRoot, resourceId, target.id);
    const raw = await readFile(
      path.join(revisionDir(projectRoot, resourceId, 1), "content.bin"),
      "utf8",
    );
    const sidecarAfter = JSON.stringify(
      (await readSidecar(projectRoot, resourceId))!.annotations,
    );
    expect(sidecarAfter).toBe(sidecarBefore);
    return { restored: JSON.parse(raw) as JSONContent, sidecarBefore };
  }

  it("restoring a revision that has no mark for the excerpt keeps it in the sidecar and the panel shows it not found", async () => {
    const { restored, sidecarBefore } = await seedAndRestore(false);
    expect(JSON.stringify(restored)).not.toContain(EXCERPT_ID);
    expect(JSON.parse(sidecarBefore)).toEqual([EXCERPT]);

    const editor = makeSourceEditor(true);
    renderPanel(editor);
    expect(row()).toHaveAttribute("data-detached", "false");
    act(() => {
      editor.commands.setContent(restored);
    });
    expect(editor.getText()).toContain(QUOTE);
    expectNotFoundWithSavedText();
  });

  it("restoring a revision that still has the mark keeps the excerpt found (the restore path does not strip a stored annotation's mark)", async () => {
    const { restored } = await seedAndRestore(true);
    expect(JSON.stringify(restored)).toContain(EXCERPT_ID);
    const editor = makeSourceEditor(false);
    renderPanel(editor);
    expect(row()).toHaveAttribute("data-detached", "true");
    act(() => {
      editor.commands.setContent(restored);
    });
    expect(row()).toHaveAttribute("data-detached", "false");
  });
});

describe("derived, not stored", () => {
  it("detached state is a pure function of the mark and the saved record; the record carries no detached field", () => {
    expect(isDetachedAnnotation(EXCERPT, false)).toBe(true);
    expect(isDetachedAnnotation(EXCERPT, true)).toBe(false);
    expect(canReattachAnnotation(EXCERPT)).toBe(true);
    expect(Object.keys(EXCERPT).sort()).toEqual(
      ["body", "createdAt", "id", "quote", "target", "updatedAt"].sort(),
    );
  });
});
