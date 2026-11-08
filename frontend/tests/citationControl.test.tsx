/** @vitest-environment jsdom */
/**
 * Feature 103, Task 31 (FR-3, FR-11, FR-24, FR-25, FR-31): the citation
 * control placed through the citation-control slot. Absent while the Sources
 * module is off; choosing a Source stores an annotation whose `target` carries
 * `sourceName`; excerpt, attachment and locator are optional; a failed write
 * adds no mark; a failed mark leaves the stored note listed as detached.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { baseSchemaExtensions } from "../components/Editor/editorExtensions";
import CitationControlSlot from "../components/Editor/Citations/CitationControlSlot";
import { StaticModulesProvider } from "../components/Modules/ModulesContext";
import { uiModuleRegistry } from "../components/Modules/uiRegistry";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { setResources } from "../src/store/resourcesSlice";
import {
  createSourceResource,
  createTextResource,
} from "../src/lib/models/resource-factory";
import type { Annotation } from "../src/lib/models/types";

const addAnnotation = vi.fn();
const listAnnotations = vi.fn();
vi.mock("../src/lib/api/annotations", () => ({
  addAnnotation: (...a: unknown[]) => addAnnotation(...a),
  listAnnotations: (...a: unknown[]) => listAnnotations(...a),
  deleteAnnotation: vi.fn(),
}));
const listAttachments = vi.fn();
vi.mock("../src/lib/api/source-attachments", () => ({
  listAttachments: (...a: unknown[]) => listAttachments(...a),
}));

const INTERVIEW = createSourceResource({ name: "Interview" });
const LETTERS = createSourceResource({ name: "Letters" });
const CHAPTER = createTextResource({ name: "Chapter One" });
const editors: Editor[] = [];

function makeEditor(): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: baseSchemaExtensions,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Harbour" }] },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function select(editor: Editor, from: number, to: number): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, from, to),
    ),
  );
}

function stored(id: string): Annotation {
  return { id, body: "", quote: "Harbour", createdAt: "t", updatedAt: "t" };
}

function mount(
  editor: Editor,
  options: { modules?: Record<string, boolean>; onStored?: () => void } = {},
) {
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test/p" }));
  store.dispatch(setSelectedProjectId("p"));
  store.dispatch(setResources([INTERVIEW, LETTERS, CHAPTER]));
  return render(
    <Provider store={store}>
      <StaticModulesProvider value={options.modules}>
        <CitationControlSlot
          editor={editor}
          resourceId={CHAPTER.id}
          onStored={options.onStored}
        />
      </StaticModulesProvider>
    </Provider>,
  );
}

beforeEach(() => {
  addAnnotation.mockReset();
  listAnnotations.mockReset().mockResolvedValue([]);
  listAttachments.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  while (editors.length) editors.pop()?.destroy();
});

describe("citation-control slot (FR-3)", () => {
  it("the Sources module registers a citation control and nothing else does", () => {
    const withSlot = uiModuleRegistry.modules
      .filter((entry) => entry.citationControl !== undefined)
      .map((entry) => entry.id);
    expect(withSlot).toEqual(["sources"]);
    expect(uiModuleRegistry.getCitationControl("sources")).toBeDefined();
    expect(uiModuleRegistry.getCitationControl("trash")).toBeUndefined();
  });

  it("renders the control while the module is on", () => {
    mount(makeEditor());
    expect(
      screen.getByRole("group", { name: "Cite a Source" }),
    ).toBeInTheDocument();
  });

  it("renders the control when config.modules has no entry (OQ-13)", () => {
    mount(makeEditor(), { modules: {} });
    expect(screen.getByRole("group", { name: "Cite a Source" })).toBeTruthy();
  });

  it("is absent while the Sources module is off", () => {
    mount(makeEditor(), { modules: { sources: false } });
    expect(screen.queryByRole("group", { name: "Cite a Source" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cite selection" })).toBeNull();
  });
});

describe("editor schema is unchanged (FR-11)", () => {
  it("keeps AnnotationMark registered with the Sources module off, and the schema does not read module flags", () => {
    const editor = makeEditor();
    mount(editor, { modules: { sources: false } });
    expect(editor.schema.marks.annotation).toBeDefined();
    const source = readFileSync(
      path.join(__dirname, "../components/Editor/editorExtensions.ts"),
      "utf8",
    );
    expect(source).toMatch(/AnnotationMark/);
    expect(source).not.toMatch(/Modules|useModuleEnabled|config\.modules/);
  });
});

describe("storing a citation (FR-24)", () => {
  it("stores an annotation with a target carrying sourceName, an empty body and the mark", async () => {
    addAnnotation.mockImplementation(
      async (_p: string, _r: string, a: { id: string }) => stored(a.id),
    );
    const onStored = vi.fn();
    const editor = makeEditor();
    select(editor, 1, 8);
    mount(editor, { onStored });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Source"), INTERVIEW.id);
    await user.click(screen.getByRole("button", { name: "Cite selection" }));
    await waitFor(() => expect(addAnnotation).toHaveBeenCalledTimes(1));
    const [projectId, resourceId, sent] = addAnnotation.mock.calls[0] as [
      string,
      string,
      { body: string; quote: string; target: Record<string, unknown> },
    ];
    expect(projectId).toBe("p");
    expect(resourceId).toBe(CHAPTER.id);
    expect(sent.body).toBe("");
    expect(sent.quote).toBe("Harbour");
    expect(sent.target).toEqual({
      sourceId: INTERVIEW.id,
      sourceName: "Interview",
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Cited Interview."),
    );
    expect(JSON.stringify(editor.getJSON())).toContain('"annotation"');
    expect(onStored).toHaveBeenCalledTimes(1);
  });

  it("carries a locator and an attachment when the writer fills them in", async () => {
    addAnnotation.mockImplementation(
      async (_p: string, _r: string, a: { id: string }) => stored(a.id),
    );
    listAttachments.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        fileName: "a.pdf",
        originalName: "scan.pdf",
        mime: "application/pdf",
        size: 1,
        addedAt: "t",
      },
    ]);
    const editor = makeEditor();
    select(editor, 1, 8);
    mount(editor);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Source"), LETTERS.id);
    await user.selectOptions(
      await screen.findByLabelText("Attachment"),
      "11111111-1111-4111-8111-111111111111",
    );
    await user.selectOptions(screen.getByLabelText("Locator type"), "page");
    await user.type(screen.getByLabelText("Locator"), "42");
    await user.click(screen.getByRole("button", { name: "Cite selection" }));
    await waitFor(() => expect(addAnnotation).toHaveBeenCalledTimes(1));
    const sent = addAnnotation.mock.calls[0][2] as {
      target: Record<string, unknown>;
    };
    expect(sent.target).toEqual({
      sourceId: LETTERS.id,
      sourceName: "Letters",
      attachmentId: "11111111-1111-4111-8111-111111111111",
      locator: { type: "page", value: "42" },
    });
  });

  it("offers an existing excerpt of the chosen Source and carries its id", async () => {
    addAnnotation.mockImplementation(
      async (_p: string, _r: string, a: { id: string }) => stored(a.id),
    );
    const excerptId = "33333333-3333-4333-8333-333333333333";
    listAnnotations.mockResolvedValue([
      {
        ...stored(excerptId),
        quote: "a passage in the interview",
        target: { sourceId: INTERVIEW.id },
      },
      { ...stored("plain"), body: "a plain note" },
    ]);
    const editor = makeEditor();
    select(editor, 1, 8);
    mount(editor);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Source"), INTERVIEW.id);
    const excerpt = await screen.findByLabelText("Excerpt");
    expect(excerpt.querySelectorAll("option")).toHaveLength(2);
    await user.selectOptions(excerpt, excerptId);
    await user.click(screen.getByRole("button", { name: "Cite selection" }));
    await waitFor(() => expect(addAnnotation).toHaveBeenCalledTimes(1));
    expect(
      (addAnnotation.mock.calls[0][2] as { target: { excerptId?: string } })
        .target.excerptId,
    ).toBe(excerptId);
  });

  it("is operable by keyboard alone", async () => {
    addAnnotation.mockImplementation(
      async (_p: string, _r: string, a: { id: string }) => stored(a.id),
    );
    const editor = makeEditor();
    select(editor, 1, 8);
    mount(editor);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByLabelText("Source")).toHaveFocus();
    // user-event does not drive a native select's arrow keys; the choice is
    // made with selectOptions, and the rest is Tab and Enter.
    await user.selectOptions(screen.getByLabelText("Source"), INTERVIEW.id);
    const button = screen.getByRole("button", { name: "Cite selection" });
    for (let i = 0; i < 6 && document.activeElement !== button; i += 1) {
      await user.tab();
    }
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(addAnnotation).toHaveBeenCalledTimes(1));
  });
});

describe("refusals and failures show text and write nothing wrong", () => {
  it("asks for a Source when none is chosen and writes nothing", async () => {
    const editor = makeEditor();
    select(editor, 1, 8);
    mount(editor);
    await userEvent.click(
      screen.getByRole("button", { name: "Cite selection" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Choose a Source");
    expect(addAnnotation).not.toHaveBeenCalled();
  });

  it("asks for a selection when none is made and writes nothing", async () => {
    const editor = makeEditor();
    mount(editor);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Source"), INTERVIEW.id);
    await user.click(screen.getByRole("button", { name: "Cite selection" }));
    expect(screen.getByRole("status")).toHaveTextContent("Select some text");
    expect(addAnnotation).not.toHaveBeenCalled();
  });

  it("refuses a locator type with no locator text before any write", async () => {
    const editor = makeEditor();
    select(editor, 1, 8);
    mount(editor);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Source"), INTERVIEW.id);
    await user.selectOptions(screen.getByLabelText("Locator type"), "page");
    await user.click(screen.getByRole("button", { name: "Cite selection" }));
    expect(screen.getByRole("status")).toHaveTextContent("locator");
    expect(addAnnotation).not.toHaveBeenCalled();
  });

  it("a failed write shows the failure, adds no mark and does not refresh the list", async () => {
    addAnnotation.mockRejectedValue(new Error("Disk is full"));
    const onStored = vi.fn();
    const editor = makeEditor();
    select(editor, 1, 8);
    mount(editor, { onStored });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Source"), INTERVIEW.id);
    await user.click(screen.getByRole("button", { name: "Cite selection" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "The citation could not be saved. Disk is full",
      ),
    );
    expect(JSON.stringify(editor.getJSON())).not.toContain('"annotation"');
    expect(onStored).not.toHaveBeenCalled();
  });

  it("a failed mark after a stored write says it is listed as detached and refreshes the list", async () => {
    addAnnotation.mockImplementation(
      async (_p: string, _r: string, a: { id: string }) => {
        // The passage changes while the write is in flight.
        editor.commands.insertContentAt(1, "X");
        return stored(a.id);
      },
    );
    const onStored = vi.fn();
    const editor = makeEditor();
    select(editor, 1, 8);
    mount(editor, { onStored });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Source"), INTERVIEW.id);
    await user.click(screen.getByRole("button", { name: "Cite selection" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "saved but could not be attached",
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("detached");
    expect(JSON.stringify(editor.getJSON())).not.toContain('"annotation"');
    expect(onStored).toHaveBeenCalledTimes(1);
  });

  it("shows a failed excerpt read as text and still lets the writer cite", async () => {
    listAnnotations.mockRejectedValue(new Error("Locked"));
    const editor = makeEditor();
    select(editor, 1, 8);
    mount(editor);
    await userEvent.selectOptions(
      screen.getByLabelText("Source"),
      INTERVIEW.id,
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "excerpts could not be read",
      ),
    );
    expect(screen.queryByLabelText("Excerpt")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Cite selection" }),
    ).toBeEnabled();
  });
});
