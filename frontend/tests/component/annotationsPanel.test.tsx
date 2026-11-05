/** @vitest-environment jsdom */
/**
 * Feature 101, Task 17 (FR-14, FR-15 failure display, FR-16 listing and
 * delete, FR-18 panel half, FR-11 plain-text render, OQ-9).
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { setAnnotationHighlight } from "../../components/Editor/Extensions/AnnotationHighlightExtension";
import { isAnnotationOnlyUpdate } from "../../components/Editor/Annotations/update-kind";
import { addAnnotationFlow } from "../../src/lib/annotation-flows";
import {
  annotation,
  Harness,
  makeEditor,
  makeHandle,
} from "../helpers/annotations-panel-harness";

const editors: Editor[] = [];
function editor(): Editor {
  const e = makeEditor();
  editors.push(e);
  return e;
}

afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

const A = annotation("a", "First note", "hello");
const D = annotation("d", "Orphan note", "a deleted passage");

function openPanel(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
  return screen.getByRole("region", { name: "Annotations" });
}

describe("AnnotationsPanel listing", () => {
  it("lists an attached annotation with its body and a detached one with its saved quote", () => {
    const handle = makeHandle({ status: "ok", annotations: [A, D] });
    render(<Harness editor={editor()} handle={handle} />);
    const panel = openPanel();
    const attached = within(
      within(panel).getByRole("list", { name: "Annotations in this document" }),
    ).getAllByTestId("annotation-item");
    expect(attached).toHaveLength(1);
    expect(attached[0]).toHaveTextContent("First note");
    const detached = within(
      within(panel).getByRole("list", { name: "Detached annotations" }),
    ).getAllByTestId("annotation-item");
    expect(detached).toHaveLength(1);
    expect(detached[0]).toHaveTextContent("Orphan note");
    expect(detached[0]).toHaveTextContent("a deleted passage");
    expect(detached[0]).toHaveAttribute("data-detached", "true");
  });

  it("shows an empty state for a resource with none", () => {
    render(
      <Harness
        editor={editor()}
        handle={makeHandle({ status: "ok", annotations: [] })}
      />,
    );
    expect(openPanel()).toHaveTextContent("No annotations in this document");
  });

  it("shows a failed read as a failure with Try again, never as an empty list", () => {
    const handle = makeHandle({ status: "failed", message: "disk unreadable" });
    render(<Harness editor={editor()} handle={handle} />);
    const panel = openPanel();
    expect(within(panel).getByRole("alert")).toHaveTextContent(
      "could not be read",
    );
    expect(panel).toHaveTextContent("disk unreadable");
    expect(panel).not.toHaveTextContent("No annotations in this document");
    expect(within(panel).queryAllByRole("list")).toHaveLength(0);
    fireEvent.click(within(panel).getByRole("button", { name: "Try again" }));
    expect(handle.retry).toHaveBeenCalledTimes(1);
  });

  it("renders a body containing <img onerror> as text, not HTML", () => {
    const evil = annotation(
      "a",
      "<img src=x onerror=alert(1)>",
      "<b>hello</b>",
    );
    render(
      <Harness
        editor={editor()}
        handle={makeHandle({ status: "ok", annotations: [evil] })}
      />,
    );
    const panel = openPanel();
    expect(panel.querySelector("img")).toBeNull();
    expect(panel.querySelector("b")).toBeNull();
    expect(panel).toHaveTextContent("<img src=x onerror=alert(1)>");
  });

  it("does not list a body-less mark and does not highlight it", () => {
    const e = editor();
    render(
      <Harness
        editor={e}
        handle={makeHandle({ status: "ok", annotations: [A] })}
      />,
    );
    const panel = openPanel();
    expect(within(panel).getAllByTestId("annotation-item")).toHaveLength(1);
    expect(panel).not.toHaveTextContent("ghost");
    act(() => setAnnotationHighlight(e, { ids: ["a"] }));
    const highlighted = e.view.dom.querySelectorAll(
      "[data-annotation-highlight]",
    );
    expect(
      [...highlighted].map((n) => n.getAttribute("data-annotation-highlight")),
    ).toEqual(["a"]);
    expect(e.getText()).toBe("hello world and more");
  });

  it("never deletes a detached annotation on its own, including across a remount", () => {
    const handle = makeHandle({ status: "ok", annotations: [A, D] });
    const e = editor();
    const first = render(<Harness editor={e} handle={handle} />);
    openPanel();
    first.unmount();
    render(<Harness editor={e} handle={handle} />);
    const panel = openPanel();
    expect(within(panel).getAllByTestId("annotation-item")).toHaveLength(2);
    expect(handle.remove).not.toHaveBeenCalled();
    expect(handle.update).not.toHaveBeenCalled();
  });
});

describe("AnnotationsPanel highlight and caret", () => {
  it("selecting an item selects its passage, scrolls it into view and marks it active", () => {
    const e = editor();
    const dispatched: boolean[] = [];
    const original = e.view.dispatch.bind(e.view);
    vi.spyOn(e.view, "dispatch").mockImplementation((tr) => {
      dispatched.push(tr.scrolledIntoView);
      original(tr);
    });
    render(
      <Harness
        editor={e}
        handle={makeHandle({ status: "ok", annotations: [A] })}
      />,
    );
    const panel = openPanel();
    act(() => setAnnotationHighlight(e, { ids: ["a"] }));
    fireEvent.click(
      within(panel).getByRole("button", { name: "Show in text" }),
    );
    expect(e.state.selection.from).toBe(1);
    expect(e.state.selection.to).toBe(6);
    expect(dispatched).toContain(true);
    const active = e.view.dom.querySelector(".annotation-highlight--active");
    expect(active?.textContent).toBe("hello");
  });

  it("flags the annotation at the caret and clears it when the caret leaves", () => {
    const e = editor();
    render(
      <Harness
        editor={e}
        handle={makeHandle({ status: "ok", annotations: [A] })}
      />,
    );
    const panel = openPanel();
    expect(within(panel).queryByText("At cursor")).toBeNull();
    act(() => {
      e.commands.setTextSelection(3);
    });
    expect(within(panel).getByText("At cursor")).toBeInTheDocument();
    expect(within(panel).getByTestId("annotation-item")).toHaveAttribute(
      "aria-current",
      "true",
    );
    act(() => {
      e.commands.setTextSelection(10);
    });
    expect(within(panel).queryByText("At cursor")).toBeNull();
  });

  it("styles the highlight by shape (underline) and tint, without red", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "styles", "editor.css"),
      "utf8",
    );
    const block = css.match(/\.tiptap \.annotation-highlight \{[^}]*\}/)?.[0];
    expect(block).toBeDefined();
    expect(block).toMatch(/text-decoration:\s*underline dotted/);
    expect(block).toMatch(/background-color/);
    const active = css.match(
      /\.tiptap \.annotation-highlight--active \{[^}]*\}/,
    )?.[0];
    expect(active).toMatch(/underline solid/);
    expect(`${block}${active}`).not.toMatch(/red/i);
  });
});

describe("AnnotationsPanel edit and delete", () => {
  it("edits a body through the handle", async () => {
    const handle = makeHandle({ status: "ok", annotations: [A] });
    render(<Harness editor={editor()} handle={handle} />);
    const panel = openPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Edit note" }));
    fireEvent.change(within(panel).getByLabelText("Note text"), {
      target: { value: "Changed" },
    });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Save note" }));
    });
    expect(handle.update).toHaveBeenCalledWith("a", "Changed");
    expect(within(panel).queryByLabelText("Note text")).toBeNull();
    expect(document.activeElement).toBe(
      within(panel).getByRole("button", { name: "Edit note" }),
    );
  });

  it("shows a failed edit and keeps the form open", async () => {
    const handle = makeHandle({ status: "ok", annotations: [A] });
    vi.mocked(handle.update).mockResolvedValue({
      ok: false,
      message: "Refused: too long",
    });
    render(<Harness editor={editor()} handle={handle} />);
    const panel = openPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Edit note" }));
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Save note" }));
    });
    expect(within(panel).getByRole("alert")).toHaveTextContent(
      "Refused: too long",
    );
    expect(within(panel).getByLabelText("Note text")).toBeInTheDocument();
  });

  it("deletes only after confirmation", async () => {
    const handle = makeHandle({ status: "ok", annotations: [A] });
    render(<Harness editor={editor()} handle={handle} />);
    const panel = openPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Delete note" }));
    const dialog = screen.getByRole("dialog");
    expect(handle.remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(handle.remove).not.toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole("button", { name: "Delete note" }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Delete note",
        }),
      );
    });
    expect(handle.remove).toHaveBeenCalledWith("a");
  });

  it("deletes a detached annotation and shows a failed delete", async () => {
    const handle = makeHandle({ status: "ok", annotations: [D] });
    vi.mocked(handle.remove).mockResolvedValue({
      ok: false,
      stage: "body",
      message: "Could not delete",
    });
    render(<Harness editor={editor()} handle={handle} />);
    const panel = openPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Delete note" }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Delete note",
        }),
      );
    });
    expect(handle.remove).toHaveBeenCalledWith("d");
    expect(within(panel).getByRole("alert")).toHaveTextContent(
      "Could not delete",
    );
  });
});

describe("AnnotationsPanel placement and focus", () => {
  for (const width of [375, 1280]) {
    it(`opens the same labelled panel at ${width}px wide`, () => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      window.dispatchEvent(new Event("resize"));
      render(
        <Harness
          editor={editor()}
          handle={makeHandle({ status: "ok", annotations: [A] })}
        />,
      );
      const button = screen.getByRole("button", { name: "Annotations" });
      expect(button).toHaveAttribute("aria-expanded", "false");
      const panel = openPanel();
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(button).toHaveAttribute("aria-controls", panel.id);
      expect(panel).toHaveTextContent("First note");
    });
  }

  it("returns focus to the toolbar button on close and on Escape", () => {
    render(
      <Harness
        editor={editor()}
        handle={makeHandle({ status: "ok", annotations: [A] })}
      />,
    );
    const button = screen.getByRole("button", { name: "Annotations" });
    const panel = openPanel();
    expect(panel.contains(document.activeElement)).toBe(true);
    fireEvent.click(
      within(panel).getByRole("button", { name: "Close annotations" }),
    );
    expect(screen.queryByRole("region", { name: "Annotations" })).toBeNull();
    expect(document.activeElement).toBe(button);

    openPanel();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Annotations" })).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe("annotation-only editor updates (FR-15)", () => {
  function captureUpdates(e: Editor): boolean[] {
    const kinds: boolean[] = [];
    e.on("update", ({ transaction, appendedTransactions }) => {
      kinds.push(
        isAnnotationOnlyUpdate([transaction, ...appendedTransactions]),
      );
    });
    return kinds;
  }

  it("classifies an annotation add and remove as annotation-only, with the text unchanged", async () => {
    const e = editor();
    const kinds = captureUpdates(e);
    const textBefore = e.getText();
    const api = {
      add: vi.fn().mockResolvedValue(annotation("n", "Note", "more")),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    // "more" sits at doc positions 17..21 in "hello world and more".
    const added = await addAnnotationFlow(api, {
      editor: e,
      projectId: "p",
      resourceId: "r",
      body: "Note",
      range: { from: 17, to: 21 },
      id: "n",
    });
    expect(added.ok).toBe(true);
    expect(kinds).toEqual([true]);
    expect(e.getText()).toBe(textBefore);
  });

  it("classifies a typed character as a text edit", () => {
    const e = editor();
    const kinds = captureUpdates(e);
    e.commands.insertContentAt(2, "x");
    expect(kinds).toEqual([false]);
  });
});

/** Positions in the harness doc: "hello" 1-6, "world" 7-12, "and" 13-16. */
function select(e: Editor, from: number, to: number): void {
  act(() => {
    e.view.dispatch(
      e.state.tr.setSelection(TextSelection.create(e.state.doc, from, to)),
    );
  });
}

describe("annotation add control (Task 18, FR-12, FR-23 editor half)", () => {
  it("adds an annotation for a non-empty selection, with the selected text as the quote", async () => {
    const e = editor();
    const handle = makeHandle({ status: "ok", annotations: [] });
    vi.mocked(handle.add).mockResolvedValue({
      ok: true,
      annotation: annotation("n", "my note", "and"),
    });
    render(<Harness editor={e} handle={handle} />);
    select(e, 13, 16);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    const panel = screen.getByRole("region", { name: "Annotations" });
    expect(panel).toHaveTextContent("and");
    expect(within(panel).getByText("and").tagName).toBe("Q");
    fireEvent.change(within(panel).getByLabelText("Note text"), {
      target: { value: "my note" },
    });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Save note" }));
    });
    expect(handle.add).toHaveBeenCalledWith("my note", { from: 13, to: 16 });
    expect(within(panel).queryByLabelText("Note text")).toBeNull();
  });

  it("offers no add for an empty selection", () => {
    const e = editor();
    const handle = makeHandle({ status: "ok", annotations: [] });
    render(<Harness editor={e} handle={handle} />);
    select(e, 14, 14);
    const add = screen.getByRole("button", { name: "Add note" });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(screen.queryByRole("region", { name: "Annotations" })).toBeNull();
    expect(handle.add).not.toHaveBeenCalled();
    select(e, 13, 16);
    expect(screen.getByRole("button", { name: "Add note" })).toBeEnabled();
    select(e, 16, 16);
    expect(screen.getByRole("button", { name: "Add note" })).toBeDisabled();
  });

  it("refuses to save, without a write, when the selected text changed after Add was chosen", async () => {
    const e = editor();
    const handle = makeHandle({ status: "ok", annotations: [] });
    render(<Harness editor={e} handle={handle} />);
    select(e, 13, 16);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    act(() => {
      e.view.dispatch(e.state.tr.insertText("XX", 1, 1));
    });
    const panel = screen.getByRole("region", { name: "Annotations" });
    fireEvent.change(within(panel).getByLabelText("Note text"), {
      target: { value: "late" },
    });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Save note" }));
    });
    expect(handle.add).not.toHaveBeenCalled();
    expect(within(panel).getByRole("alert")).toHaveTextContent("changed");
    expect(within(panel).getByLabelText("Note text")).toBeInTheDocument();
  });

  it("keeps the form and shows the message when the write fails", async () => {
    const e = editor();
    const handle = makeHandle({ status: "ok", annotations: [] });
    vi.mocked(handle.add).mockResolvedValue({
      ok: false,
      stage: "write",
      message: "Disk is full.",
    });
    render(<Harness editor={e} handle={handle} />);
    select(e, 13, 16);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    const panel = screen.getByRole("region", { name: "Annotations" });
    fireEvent.change(within(panel).getByLabelText("Note text"), {
      target: { value: "x" },
    });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Save note" }));
    });
    expect(within(panel).getByRole("alert")).toHaveTextContent("Disk is full.");
    expect(within(panel).getByLabelText("Note text")).toBeInTheDocument();
  });

  it("disables Save for an over-long selection instead of attempting a refused write", () => {
    const e = editor();
    const handle = makeHandle({ status: "ok", annotations: [] });
    render(<Harness editor={e} handle={handle} />);
    act(() => {
      e.commands.insertContentAt(e.state.doc.content.size - 1, "z".repeat(600));
    });
    select(e, 22, 22 + 600);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    const panel = screen.getByRole("region", { name: "Annotations" });
    fireEvent.change(within(panel).getByLabelText("Note text"), {
      target: { value: "x" },
    });
    expect(
      within(panel).getByRole("button", { name: "Save note" }),
    ).toBeDisabled();
    expect(panel).toHaveTextContent("too long");
  });

  it("is operable by keyboard alone and the controls have accessible names", async () => {
    const user = userEvent.setup();
    const e = editor();
    const handle = makeHandle({ status: "ok", annotations: [] });
    vi.mocked(handle.add).mockResolvedValue({
      ok: true,
      annotation: annotation("n", "kb", "and"),
    });
    render(<Harness editor={e} handle={handle} />);
    select(e, 13, 16);
    const add = screen.getByRole("button", { name: "Add note" });
    expect(add.tagName).toBe("BUTTON");
    act(() => add.focus());
    await user.keyboard("{Enter}");
    const panel = screen.getByRole("region", { name: "Annotations" });
    const input = within(panel).getByLabelText("Note text");
    expect(document.activeElement).toBe(input);
    await user.keyboard("kb");
    await user.tab();
    expect(document.activeElement).toBe(
      within(panel).getByRole("button", { name: "Save note" }),
    );
    await user.keyboard("{Enter}");
    expect(handle.add).toHaveBeenCalledWith("kb", { from: 13, to: 16 });
  });
});

describe("annotation re-attach (Task 18, FR-16)", () => {
  it("re-attaches a detached note to the current selection through the handle", async () => {
    const e = editor();
    const handle = makeHandle({ status: "ok", annotations: [D] });
    render(<Harness editor={e} handle={handle} />);
    select(e, 13, 16);
    const panel = openPanel();
    const button = within(panel).getByRole("button", {
      name: "Re-attach note to selected text",
    });
    expect(button).toBeEnabled();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(handle.reattach).toHaveBeenCalledWith("d", { from: 13, to: 16 });
  });

  it("is disabled for an empty selection and absent on an attached note", () => {
    const e = editor();
    const handle = makeHandle({ status: "ok", annotations: [A, D] });
    render(<Harness editor={e} handle={handle} />);
    select(e, 14, 14);
    const panel = openPanel();
    const buttons = within(panel).getAllByRole("button", {
      name: "Re-attach note to selected text",
    });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBeDisabled();
    const attachedItem = within(panel)
      .getAllByTestId("annotation-item")
      .find(
        (li: HTMLElement) => li.dataset.detached === "false",
      ) as HTMLElement;
    expect(
      within(attachedItem).queryByRole("button", { name: /Re-attach/ }),
    ).toBeNull();
    select(e, 13, 16);
    expect(buttons[0]).toBeEnabled();
  });

  it("shows a failed re-attach", async () => {
    const e = editor();
    const handle = makeHandle({ status: "ok", annotations: [D] });
    vi.mocked(handle.reattach).mockResolvedValue({
      ok: false,
      stage: "write",
      message: "Refused: quote too long",
    });
    render(<Harness editor={e} handle={handle} />);
    select(e, 13, 16);
    const panel = openPanel();
    await act(async () => {
      fireEvent.click(
        within(panel).getByRole("button", {
          name: "Re-attach note to selected text",
        }),
      );
    });
    expect(within(panel).getByRole("alert")).toHaveTextContent(
      "Refused: quote too long",
    );
  });

  it("is keyboard operable (a native button reached by Tab and run with Enter)", async () => {
    const user = userEvent.setup();
    const e = editor();
    const handle = makeHandle({ status: "ok", annotations: [D] });
    render(<Harness editor={e} handle={handle} />);
    select(e, 13, 16);
    const panel = openPanel();
    const button = within(panel).getByRole("button", {
      name: "Re-attach note to selected text",
    });
    expect(button.tagName).toBe("BUTTON");
    act(() => button.focus());
    await user.keyboard("{Enter}");
    expect(handle.reattach).toHaveBeenCalledWith("d", { from: 13, to: 16 });
  });
});
