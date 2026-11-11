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
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { baseSchemaExtensions } from "../components/Editor/editorExtensions";
import CitationControlSlot from "../components/Editor/Citations/CitationControlSlot";
import { StaticModulesProvider } from "../components/Modules/ModulesContext";
import {
  UI_SLOT_KINDS,
  uiModuleRegistry,
} from "../components/Modules/uiRegistry";
import { StaticSharingLimitsProvider } from "../components/Sharing/SharingLimitsContext";
import ExcerptsSection from "../components/Sources/ExcerptsSection";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
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
  it("the Sources and Claims modules register citation controls and nothing else does", () => {
    const withSlot = uiModuleRegistry.modules
      .filter((entry) => entry.citationControl !== undefined)
      .map((entry) => entry.id);
    expect(withSlot).toEqual(["sources", "claims"]);
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

/**
 * Task 45 (FR-21, FR-6 (d)): "Mark as excerpt" in the editor while the open
 * resource is a Source, placed through the same citation-control slot. These
 * use a real TipTap editor and a real selection, not `activeEditorRegistry`.
 */
describe("Mark as excerpt for an open Source (FR-21)", () => {
  const MARK = { name: "Mark as excerpt" };
  const GROUP = { name: "Mark an excerpt of this Source" };

  function mountFor(
    editor: Editor,
    resourceId: string,
    options: {
      modules?: Record<string, boolean>;
      onStored?: () => void;
      withSections?: boolean;
    } = {},
  ) {
    const store = makeStore();
    store.dispatch(setProject({ id: "p", rootPath: "/test/p" }));
    store.dispatch(setSelectedProjectId("p"));
    store.dispatch(setResources([INTERVIEW, LETTERS, CHAPTER]));
    return render(
      <Provider store={store}>
        <TrashRefreshProvider>
          <StaticSharingLimitsProvider>
            <StaticModulesProvider value={options.modules}>
              <CitationControlSlot
                editor={editor}
                resourceId={resourceId}
                onStored={options.onStored}
              />
              {options.withSections ? (
                <ExcerptsSection resource={INTERVIEW} />
              ) : null}
            </StaticModulesProvider>
          </StaticSharingLimitsProvider>
        </TrashRefreshProvider>
      </Provider>,
    );
  }

  function statusOf(): HTMLElement {
    return within(screen.getByRole("group", GROUP)).getByRole("status");
  }

  it("is present for a Source with the module on, keyboard operable, and registers no new slot kind", async () => {
    const editor = makeEditor();
    select(editor, 1, 8);
    mountFor(editor, INTERVIEW.id);
    expect(screen.getByRole("group", GROUP)).toBeInTheDocument();
    const button = screen.getByRole("button", MARK);
    const user = userEvent.setup();
    for (let i = 0; i < 12 && document.activeElement !== button; i += 1) {
      await user.tab();
    }
    expect(button).toHaveFocus();
    expect(UI_SLOT_KINDS).toEqual([
      "view",
      "attachmentsSection",
      "citationControl",
    ]);
  });

  it("is absent for a non-Source resource", () => {
    mountFor(makeEditor(), CHAPTER.id);
    expect(screen.queryByRole("group", GROUP)).toBeNull();
    expect(screen.queryByRole("button", MARK)).toBeNull();
  });

  it("is absent while the Sources module is off", () => {
    mountFor(makeEditor(), INTERVIEW.id, { modules: { sources: false } });
    expect(screen.queryByRole("group", GROUP)).toBeNull();
    expect(screen.queryByRole("button", MARK)).toBeNull();
  });

  it("stores an annotation targeting the Source, shows the result, and the Sources view then lists it", async () => {
    const kept: Annotation[] = [];
    addAnnotation.mockImplementation(
      async (_p: string, _r: string, a: Record<string, unknown>) => {
        const note: Annotation = {
          id: a.id as string,
          body: a.body as string,
          quote: a.quote as string,
          createdAt: "t",
          updatedAt: "t",
          target: a.target as Annotation["target"],
        };
        kept.push(note);
        return note;
      },
    );
    listAnnotations.mockImplementation(async () => [...kept]);
    const onStored = vi.fn();
    const editor = makeEditor();
    select(editor, 1, 8);
    mountFor(editor, INTERVIEW.id, { onStored });
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Excerpt locator type" }),
      "page",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Excerpt locator value" }),
      "47",
    );
    await user.click(screen.getByRole("button", MARK));
    await waitFor(() => expect(addAnnotation).toHaveBeenCalledTimes(1));
    const [projectId, resourceId, sent] = addAnnotation.mock.calls[0] as [
      string,
      string,
      { body: string; quote: string; target: unknown },
    ];
    expect(projectId).toBe("p");
    expect(resourceId).toBe(INTERVIEW.id);
    expect(sent.quote).toBe("Harbour");
    expect(sent.target).toEqual({
      sourceId: INTERVIEW.id,
      sourceName: "Interview",
      locator: { type: "page", value: "47" },
    });
    await waitFor(() =>
      expect(statusOf()).toHaveTextContent("Marked the excerpt."),
    );
    expect(JSON.stringify(editor.getJSON())).toContain('"annotation"');
    expect(onStored).toHaveBeenCalledTimes(1);

    cleanup();
    mountFor(makeEditor(), CHAPTER.id, { withSections: true });
    const list = await screen.findByRole("list", { name: "Excerpts" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Harbour");
    expect(items[0]).toHaveTextContent("Page 47");
  });

  it("with the module off, an existing excerpt is still listed in the Sources view", async () => {
    listAnnotations.mockResolvedValue([
      {
        ...stored("e1"),
        target: { sourceId: INTERVIEW.id, sourceName: "Interview" },
      },
    ]);
    mountFor(makeEditor(), CHAPTER.id, {
      modules: { sources: false },
      withSections: true,
    });
    const list = await screen.findByRole("list", { name: "Excerpts" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  });

  it("a failed write shows the failure, adds no mark and does not refresh the list", async () => {
    addAnnotation.mockRejectedValue(new Error("Disk is full"));
    const onStored = vi.fn();
    const editor = makeEditor();
    select(editor, 1, 8);
    mountFor(editor, INTERVIEW.id, { onStored });
    await userEvent.click(screen.getByRole("button", MARK));
    await waitFor(() => expect(statusOf()).toHaveTextContent("Disk is full"));
    expect(JSON.stringify(editor.getJSON())).not.toContain('"annotation"');
    expect(onStored).not.toHaveBeenCalled();
  });

  it("with no selection says to select text and writes nothing", async () => {
    mountFor(makeEditor(), INTERVIEW.id);
    await userEvent.click(screen.getByRole("button", MARK));
    await waitFor(() =>
      expect(statusOf()).toHaveTextContent("Select some text"),
    );
    expect(addAnnotation).not.toHaveBeenCalled();
  });

  it("a locator type with no value is refused with a message and writes nothing", async () => {
    const editor = makeEditor();
    select(editor, 1, 8);
    mountFor(editor, INTERVIEW.id);
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Excerpt locator type" }),
      "line",
    );
    await user.click(screen.getByRole("button", MARK));
    expect(statusOf()).toHaveTextContent("Enter where it sits");
    expect(addAnnotation).not.toHaveBeenCalled();
  });
});
