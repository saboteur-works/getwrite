/** @vitest-environment jsdom */
/**
 * Feature 110, Task 13 (FR-14): the read-only stored-document renderer. A
 * stored TipTap document renders to plain React nodes; text is text, an
 * unsupported node is a visible placeholder, and no editor is created.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StoredDocumentView from "../../components/Folklore/StoredDocumentView";
import { getActiveEditor } from "../../components/Editor/activeEditorRegistry";
import { runAxe } from "../a11y/helpers/axe";

const text = (value: string, marks?: { type: string }[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

describe("StoredDocumentView", () => {
  it("renders headings, paragraphs, lists and emphasis as structure", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
        {
          type: "paragraph",
          content: [
            text("plain "),
            text("bold", [{ type: "bold" }]),
            text(" "),
            text("italic", [{ type: "italic" }]),
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [text("one")] }],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [text("first")] }],
            },
          ],
        },
      ],
    };
    const { container } = render(<StoredDocumentView document={doc} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Title" }),
    ).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelectorAll("ul > li")).toHaveLength(1);
    expect(container.querySelectorAll("ol > li")).toHaveLength(1);
    expect(container.querySelector("li p")?.textContent).toBe("one");
  });

  it("renders markup in text as text, never as HTML", () => {
    const markup = '<img src=x onerror="alert(1)"><b>hi</b>';
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [text(markup)] }],
    };
    const { container } = render(<StoredDocumentView document={doc} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe(markup);
  });

  it("shows a visible placeholder for an unsupported node, never dropping it", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [text("before")] },
        { type: "mysteryBlock", content: [{ type: "paragraph" }] },
        { type: "paragraph", content: [text("after")] },
      ],
    };
    render(<StoredDocumentView document={doc} />);
    expect(screen.getByText(/mysteryBlock/)).toBeTruthy();
    expect(screen.getByText(/not shown/i)).toBeTruthy();
    expect(screen.getByText("before")).toBeTruthy();
    expect(screen.getByText("after")).toBeTruthy();
  });

  it("shows a placeholder for an unsupported inline node", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [text("a"), { type: "mention" }, text("b")],
        },
      ],
    };
    render(<StoredDocumentView document={doc} />);
    expect(screen.getByText(/mention/)).toBeTruthy();
  });

  it("shows a placeholder for a malformed document, not an empty view", () => {
    render(<StoredDocumentView document={"nope"} />);
    expect(screen.getByRole("note").textContent).toMatch(/not shown/i);
  });

  it("creates no editor and leaves getActiveEditor unchanged", () => {
    const before = getActiveEditor();
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [text("x")] }],
    };
    for (let i = 0; i < 3; i += 1) {
      const { container, unmount } = render(
        <StoredDocumentView document={doc} />,
      );
      expect(container.querySelector(".ProseMirror")).toBeNull();
      expect(container.querySelector("[contenteditable]")).toBeNull();
      expect(getActiveEditor()).toBe(before);
      unmount();
      expect(getActiveEditor()).toBe(before);
    }
  });

  it("has no axe violations", async () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 3 }, content: [text("H")] },
        { type: "paragraph", content: [text("p")] },
        { type: "gadget" },
      ],
    };
    const { container } = render(<StoredDocumentView document={doc} />);
    await runAxe(container, ["region"]);
  });
});
