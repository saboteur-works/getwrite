import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MarkdownSourceView from "../components/Editor/MarkdownSourceView";
import MarkdownSwitchWarningModal from "../components/Editor/MarkdownSwitchWarningModal";
import {
  documentToMarkdown,
  markdownToDocument,
} from "../src/lib/export/markdown-serializer";
import type { MarkdownConstructWarning } from "../src/lib/export/types";
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

describe("MarkdownSwitchWarningModal", () => {
  const baseProps = {
    isOpen: true,
    warnings: [] as MarkdownConstructWarning[],
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it("explains the impact of switching to Markdown editing", () => {
    render(<MarkdownSwitchWarningModal {...baseProps} />);
    // A warning is always shown so the user understands the switch converts the
    // document and that some formatting will not survive the round trip.
    expect(
      screen.getByText(/converts this document to github-flavored markdown/i),
    ).toBeTruthy();
    expect(screen.getByText(/won't bring it back/i)).toBeTruthy();
  });

  it("exhaustively lists formatting Markdown cannot preserve, even when the document is clean", () => {
    render(<MarkdownSwitchWarningModal {...baseProps} warnings={[]} />);
    // These are dropped by the conversion but are NOT caught by the per-document
    // detector, so they must always be spelled out for the user.
    expect(screen.getByText(/Text alignment/i)).toBeTruthy();
    expect(screen.getByText(/highlight, and background colours/i)).toBeTruthy();
    expect(screen.getByText(/Custom fonts and font sizes/i)).toBeTruthy();
    expect(screen.getByText(/Paragraph line spacing/i)).toBeTruthy();
    // Image-link behaviour (kept as inline HTML) is always explained too.
    expect(screen.getByText(/inline HTML/i)).toBeTruthy();
  });

  it("calls out the lossy constructs found in the current document, with counts", () => {
    const warnings: MarkdownConstructWarning[] = [
      {
        construct: "text-style",
        label: "Text colour & font styling",
        kind: "dropped",
        count: 2,
      },
      {
        construct: "image-link",
        label: "Image with GetWrite link",
        kind: "html-fallback",
        count: 1,
      },
    ];
    render(<MarkdownSwitchWarningModal {...baseProps} warnings={warnings} />);
    expect(screen.getByText(/Found in this document/i)).toBeTruthy();
    expect(screen.getByText(/Text colour & font styling/)).toBeTruthy();
    expect(screen.getByText(/Image with GetWrite link/)).toBeTruthy();
  });

  it("omits the document-specific section when nothing lossy is present", () => {
    render(<MarkdownSwitchWarningModal {...baseProps} warnings={[]} />);
    // The general exhaustive list still renders; only the per-document callout
    // is hidden when the document contains no detected lossy constructs.
    expect(screen.queryByText(/Found in this document/i)).toBeNull();
  });

  it("calls onConfirm when the user confirms the switch", () => {
    const onConfirm = vi.fn();
    render(<MarkdownSwitchWarningModal {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /edit as markdown/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the user cancels", () => {
    const onCancel = vi.fn();
    render(<MarkdownSwitchWarningModal {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    render(<MarkdownSwitchWarningModal {...baseProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
