import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MarkdownSourceView from "../components/Editor/MarkdownSourceView";
import {
  documentToMarkdown,
  markdownToDocument,
} from "../src/lib/export/markdown-serializer";
import type { JSONContent } from "@tiptap/core";

describe("MarkdownSourceView", () => {
  it("shows the provided Markdown source in an editable textarea", () => {
    render(
      <MarkdownSourceView
        value={"## Heading\n\n- one\n- two"}
        onChange={vi.fn()}
        onExitToRichText={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText(
      /markdown source/i,
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("## Heading\n\n- one\n- two");
  });

  it("reports edits to the Markdown source via onChange", () => {
    const onChange = vi.fn();
    render(
      <MarkdownSourceView
        value="original"
        onChange={onChange}
        onExitToRichText={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText(/markdown source/i);
    fireEvent.change(textarea, { target: { value: "edited" } });

    expect(onChange).toHaveBeenCalledWith("edited");
  });

  it("returns to the rich-text editor when the toggle is clicked", () => {
    const onExitToRichText = vi.fn();
    render(
      <MarkdownSourceView
        value=""
        onChange={vi.fn()}
        onExitToRichText={onExitToRichText}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /rich text/i }));

    expect(onExitToRichText).toHaveBeenCalledTimes(1);
  });
});

describe("Markdown source/rich toggle boundary conversion", () => {
  it("renders the structure of edited Markdown when toggling back to rich text", () => {
    // Simulates: user edits the source view, then toggles back. The boundary
    // parses the edited GFM into a TipTap document the editor can render.
    const edited = "## Edited Heading\n\n- alpha\n- beta";
    const doc = markdownToDocument(edited) as JSONContent;

    const heading = doc.content?.find((node) => node.type === "heading");
    expect(heading?.attrs?.level).toBe(2);

    const list = doc.content?.find((node) => node.type === "bulletList");
    expect(list?.content).toHaveLength(2);
  });

  it("shows GFM for the current rich-text content when toggling into source", () => {
    // Simulates: user toggles into source. The boundary serializes the live
    // editor JSON into GFM for display in the textarea.
    const richDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "Bold" },
            { type: "text", text: " and plain" },
          ],
        },
      ],
    };

    const markdown = documentToMarkdown(richDoc);
    expect(markdown).toContain("**Bold**");
    expect(markdown).toContain("and plain");
  });
});
