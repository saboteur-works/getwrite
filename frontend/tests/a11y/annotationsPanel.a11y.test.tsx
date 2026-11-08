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
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import type { Annotation, AnyResource } from "../../src/lib/models/types";
import type { AnnotationsState } from "../../src/hooks/useAnnotations";
import {
  annotation,
  Harness,
  makeEditor,
  makeHandle,
} from "../helpers/annotations-panel-harness";
import { runAxe } from "./helpers/axe";

vi.mock("../../src/lib/api/trash", () => ({
  listTrash: vi.fn().mockResolvedValue({ resources: [], folders: [] }),
}));
vi.mock("../../src/lib/api/source-attachments", () => ({
  listAttachments: vi.fn().mockResolvedValue([]),
}));

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

/**
 * Feature 103, Task 33: citation rows, a locator-only excerpt (no mark by
 * design) and a citation whose Source is gone (purged: not in the project and
 * not in Trash).
 */
describe("a11y: AnnotationsPanel citations and excerpts", () => {
  const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
  const present: Annotation = {
    ...annotation("a", "Cited", "hello"),
    target: {
      sourceId: SOURCE_ID,
      sourceName: "Interview",
      locator: { value: "p. 4" },
    },
  };
  const excerpt: Annotation = {
    ...annotation("x", "", ""),
    target: {
      sourceId: SOURCE_ID,
      attachmentId: "22222222-2222-4222-8222-222222222222",
      locator: { value: "0:42" },
    },
  };
  const missing: Annotation = {
    ...annotation("d", "Orphan", "gone"),
    target: {
      sourceId: "99999999-9999-4999-8999-999999999999",
      sourceName: "Old name",
    },
  };

  it("has no axe violations and names the Source and the removed state in text", async () => {
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
          name: "Interview",
          type: "source",
          orderIndex: 0,
        } as AnyResource,
      ]),
    );
    const editor = makeEditor();
    editors.push(editor);
    const { container } = render(
      <Provider store={store}>
        <Harness
          editor={editor}
          handle={makeHandle({
            status: "ok",
            annotations: [present, excerpt, missing],
          })}
        />
      </Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
    await screen.findByText(/permanently deleted/i);
    expect(screen.getByText(/Old name \(removed\)/)).toBeInTheDocument();
    await runAxe(container, ["region"]);
  });
});
