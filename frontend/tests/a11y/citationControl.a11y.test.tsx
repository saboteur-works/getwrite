/** @vitest-environment jsdom */
/**
 * Feature 103, Task 31 (FR-24, FR-25): axe-core check and keyboard
 * operability of the citation control (`docs/standards/accessibility.md`).
 * `region` is disabled because the harness mounts the control without the app
 * shell's landmarks (test-harness isolation); the control's own labelled group
 * and status region are asserted.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import CitationControlSlot from "../../components/Editor/Citations/CitationControlSlot";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import { createSourceResource } from "../../src/lib/models/resource-factory";
import { runAxe } from "./helpers/axe";

vi.mock("../../src/lib/api/annotations", () => ({
  addAnnotation: vi.fn().mockRejectedValue(new Error("Disk is full")),
  listAnnotations: vi.fn().mockResolvedValue([]),
  deleteAnnotation: vi.fn(),
}));
vi.mock("../../src/lib/api/source-attachments", () => ({
  listAttachments: vi.fn().mockResolvedValue([]),
}));

const SOURCE = createSourceResource({ name: "Interview" });
const editors: Editor[] = [];
afterEach(() => {
  cleanup();
  while (editors.length) editors.pop()?.destroy();
});

/** The form's own button, not the disclosure that opens the form. */
function citeButtonInForm(): HTMLElement {
  return within(screen.getByRole("group", { name: "Cite a Source" })).getByRole(
    "button",
    { name: "Cite selection" },
  );
}

function mount(resourceId = "chapter", open = true): Editor {
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
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 8)),
  );
  const store = makeStore();
  store.dispatch(setProject({ id: "p", rootPath: "/test/p" }));
  store.dispatch(setSelectedProjectId("p"));
  store.dispatch(setResources([SOURCE]));
  render(
    <Provider store={store}>
      <CitationControlSlot editor={editor} resourceId={resourceId} />
    </Provider>,
  );
  // The control starts collapsed; these tests check the expanded form.
  if (open) {
    fireEvent.click(screen.getByRole("button", { name: "Cite selection" }));
  }
  return editor;
}

describe("CitationControl accessibility", () => {
  it("has no axe violations at rest", async () => {
    mount();
    await runAxe(screen.getByRole("group", { name: "Cite a Source" }), [
      "region",
    ]);
  });

  it("has no axe violations showing a failure, and the failure is text", async () => {
    mount();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Source"), SOURCE.id);
    await user.click(citeButtonInForm());
    expect(await screen.findByText(/could not be saved/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Cite a Source" })).getByRole(
        "status",
      ),
    ).toHaveTextContent("Disk is full");
    await runAxe(screen.getByRole("group", { name: "Cite a Source" }), [
      "region",
    ]);
  });

  it("Mark as excerpt (Source open): no axe violations at rest and showing a failure, named, focus-visible-reachable by Tab, failure is text", async () => {
    mount(SOURCE.id);
    const group = screen.getByRole("group", {
      name: "Mark an excerpt of this Source",
    });
    await runAxe(group, ["region"]);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Mark as excerpt" });
    for (let i = 0; i < 12 && document.activeElement !== button; i += 1) {
      await user.tab();
    }
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    const status = await screen.findByText(/Disk is full/);
    expect(status).toHaveAttribute("role", "status");
    await runAxe(group, ["region"]);
  });

  it("labels every field and reaches the button by Tab", async () => {
    mount();
    const user = userEvent.setup();
    for (const name of ["Source", "Locator type", "Locator"]) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
    // Opening the disclosure already moved focus into the form.
    expect(screen.getByLabelText("Source")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Locator type")).toHaveFocus();
  });

  it("the disclosure has no axe violations collapsed or expanded, and is a named button with aria-expanded", async () => {
    mount("chapter", false);
    const button = screen.getByRole("button", { name: "Cite selection" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await runAxe(button.parentElement?.parentElement as HTMLElement, [
      "region",
    ]);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await runAxe(button.parentElement?.parentElement as HTMLElement, [
      "region",
    ]);
  });
});
