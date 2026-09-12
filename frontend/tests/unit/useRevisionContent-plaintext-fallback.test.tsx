import { describe, it, expect, vi, beforeEach } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — renderHook exists at runtime but TS can't resolve it due to react-dom/test-utils having no types in React 19
import { renderHook, waitFor } from "@testing-library/react";

const fetchResourceContent = vi.fn();
const fetchRevisionContent = vi.fn();

vi.mock("../../src/lib/api/resources", () => ({
  fetchResourceContent: (...args: unknown[]) => fetchResourceContent(...args),
  fetchRevisionContent: (...args: unknown[]) => fetchRevisionContent(...args),
}));

import { useRevisionContent } from "../../components/WorkArea/useRevisionContent";

/**
 * Regression coverage for a canonical revision whose payload is plain text
 * rather than a serialized document.
 *
 * `EditView` passes `tipTapDoc ?? content` to the editor. When this hook
 * cleared `tipTapDoc` on an unparseable payload, the bare string reached
 * Tiptap, which parses a string as HTML — collapsing every newline into a
 * single paragraph, which the canonical autosave then persisted over the
 * resource's own files.
 */
describe("useRevisionContent — plain-text revision payloads", () => {
  const THREE_PARAGRAPHS = "First line.\nSecond line.\nThird line.";

  beforeEach(() => {
    vi.clearAllMocks();
    fetchResourceContent.mockResolvedValue({
      resourceContent: { plaintextContent: THREE_PARAGRAPHS },
      revisions: [{ id: "rev-1", isCanonical: true }],
    });
  });

  function renderWithPayload(payload: string) {
    fetchRevisionContent.mockResolvedValue(payload);
    return renderHook(() =>
      useRevisionContent({
        initialContent: "",
        selectedResourceId: "resource-1",
        projectId: "project-dir",
        currentRevisionId: null,
        currentRevisionContent: null,
      }),
    );
  }

  it("converts a plain-text canonical payload into one paragraph per line", async () => {
    const { result } = renderWithPayload(THREE_PARAGRAPHS);

    await waitFor(() => expect(result.current.tipTapDoc).not.toBeNull());

    const doc = result.current.tipTapDoc!;
    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(3);
    expect(doc.content.every((node) => node.type === "paragraph")).toBe(true);
    expect(doc.content[1]?.content?.[0]?.text).toBe("Second line.");
  });

  it("never leaves the document null for a plain-text payload, so no bare string reaches the editor", async () => {
    const { result } = renderWithPayload(THREE_PARAGRAPHS);

    await waitFor(() => expect(result.current.content).toBe(THREE_PARAGRAPHS));
    expect(result.current.tipTapDoc).not.toBeNull();
  });

  it("still prefers a serialized document when the payload is JSON", async () => {
    const serialized = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Authored", marks: [{ type: "bold" }] },
          ],
        },
      ],
    });

    const { result } = renderWithPayload(serialized);

    await waitFor(() => expect(result.current.tipTapDoc).not.toBeNull());
    expect(result.current.tipTapDoc!.content).toHaveLength(1);
    expect(result.current.content).toBe(serialized);
  });
});
