/** @vitest-environment jsdom */
/**
 * Feature 101, Task 17 (FR-14): axe-core checks and keyboard operability of
 * the annotations panel in its populated, detached, empty and failed states
 * (`docs/standards/accessibility.md`). `region` is disabled because the
 * harness mounts the panel without the app shell's landmarks (test-harness
 * isolation, not a defect); the panel's own labelled region is asserted.
 */
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import type { AnnotationsState } from "../../src/hooks/useAnnotations";
import {
  annotation,
  Harness,
  makeEditor,
  makeHandle,
} from "../helpers/annotations-panel-harness";
import { runAxe } from "./helpers/axe";

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

function renderOpen(state: AnnotationsState): HTMLElement {
  const editor = makeEditor();
  editors.push(editor);
  const { container } = render(
    <Harness editor={editor} handle={makeHandle(state)} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
  return container;
}

const STATES: [string, AnnotationsState][] = [
  [
    "populated with a detached note",
    {
      status: "ok",
      annotations: [
        annotation("a", "First note", "hello"),
        annotation("d", "Orphan note", "gone"),
      ],
    },
  ],
  ["empty", { status: "ok", annotations: [] }],
  ["failed read", { status: "failed", message: "unreadable" }],
  ["loading", { status: "loading" }],
];

describe("a11y: AnnotationsPanel", () => {
  for (const [name, state] of STATES) {
    it(`has no axe violations when ${name}`, async () => {
      const container = renderOpen(state);
      expect(
        screen.getByRole("region", { name: "Annotations" }),
      ).toBeInTheDocument();
      await runAxe(container, ["region"]);
    });
  }

  it("has no axe violations with the delete confirmation open", async () => {
    renderOpen({
      status: "ok",
      annotations: [annotation("a", "First note", "hello")],
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await runAxe(document.body, ["region", "aria-hidden-focus"]);
  });

  it("gives every control an accessible name and a visible focus style", () => {
    renderOpen({
      status: "ok",
      annotations: [annotation("a", "First note", "hello")],
    });
    const panel = screen.getByRole("region", { name: "Annotations" });
    const buttons = within(panel).getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const button of buttons) {
      expect(button).toHaveAccessibleName();
      expect(button.className).toMatch(/focus-visible/);
    }
    const heading = within(panel).getByRole("heading", { name: "Annotations" });
    expect(heading.className).toMatch(/focus-visible/);
  });

  it("moves focus into the panel on open and reaches every control by Tab order", () => {
    renderOpen({
      status: "ok",
      annotations: [annotation("a", "First note", "hello")],
    });
    const panel = screen.getByRole("region", { name: "Annotations" });
    expect(panel.contains(document.activeElement)).toBe(true);
    for (const button of within(panel).getAllByRole("button")) {
      expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it("is operable by keyboard alone: edit, cancel, then Escape closes and returns focus", () => {
    renderOpen({
      status: "ok",
      annotations: [annotation("a", "First note", "hello")],
    });
    const opener = screen.getByRole("button", { name: "Annotations" });
    const panel = screen.getByRole("region", { name: "Annotations" });
    const edit = within(panel).getByRole("button", { name: "Edit note" });
    act(() => edit.focus());
    fireEvent.click(edit);
    expect(within(panel).getByLabelText("Note text")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(
      within(panel).getByRole("button", { name: "Edit note" }),
    );
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
  });
});
