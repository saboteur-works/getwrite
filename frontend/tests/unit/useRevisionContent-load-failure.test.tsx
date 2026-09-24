import { describe, it, expect, vi, beforeEach } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — renderHook exists at runtime but TS can't resolve it due to react-dom/test-utils having no types in React 19
import { renderHook, waitFor, act } from "@testing-library/react";

const fetchResourceContent = vi.fn();
const fetchRevisionContent = vi.fn();

vi.mock("../../src/lib/api/resources", () => ({
  fetchResourceContent: (...args: unknown[]) => fetchResourceContent(...args),
  fetchRevisionContent: (...args: unknown[]) => fetchRevisionContent(...args),
}));

import { useRevisionContent } from "../../components/WorkArea/useRevisionContent";

/**
 * Both transports return `null` for "the read failed" AND for "there is
 * nothing here". The hook used to return early on either, leaving the editor
 * showing `initialContent` with no error and no retry — a blank page for a
 * resource that was fine on disk, whose first keystroke autosaved the blank
 * over it. `loadState` is what lets the view tell the two apart.
 */
describe("useRevisionContent — load failures", () => {
  const render = () =>
    renderHook(() =>
      useRevisionContent({
        initialContent: "",
        selectedResourceId: "resource-1",
        projectId: "project-dir",
        currentRevisionId: null,
        currentRevisionContent: null,
      }),
    );

  beforeEach(() => vi.clearAllMocks());

  it("reports an error when the resource content read fails", async () => {
    fetchResourceContent.mockResolvedValue(null);
    const { result } = render();
    await waitFor(() => expect(result.current.loadState).toBe("error"));
  });

  it("reports an error when the canonical revision read fails", async () => {
    fetchResourceContent.mockResolvedValue({
      resourceContent: { plaintextContent: "On disk." },
      revisions: [{ id: "rev-1", isCanonical: true }],
    });
    fetchRevisionContent.mockResolvedValue(null);

    const { result } = render();
    await waitFor(() => expect(result.current.loadState).toBe("error"));
  });

  it("reports loaded when a failed read still left a document from Redux", async () => {
    // `EditView` also receives content through `currentRevisionContent`. A
    // failed fetch alongside a document that arrived by another route is not
    // the dangerous case — there is nothing blank to type over.
    fetchResourceContent.mockResolvedValue(null);
    const { result } = renderHook(() =>
      useRevisionContent({
        initialContent: "",
        selectedResourceId: "resource-1",
        projectId: "project-dir",
        currentRevisionId: "rev-1",
        currentRevisionContent: JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "From Redux." }],
            },
          ],
        }),
      }),
    );

    await waitFor(() => expect(result.current.tipTapDoc).not.toBeNull());
    expect(result.current.loadState).toBe("loaded");
  });

  it("reports loaded — not error — for a resource with no canonical revision", async () => {
    fetchResourceContent.mockResolvedValue({
      resourceContent: { plaintextContent: "On disk." },
      revisions: [],
    });

    const { result } = render();
    await waitFor(() => expect(result.current.loadState).toBe("loaded"));
  });

  it("reports loaded for a genuinely empty document", async () => {
    fetchResourceContent.mockResolvedValue({
      resourceContent: { plaintextContent: "" },
      revisions: [{ id: "rev-1", isCanonical: true }],
    });
    fetchRevisionContent.mockResolvedValue(
      JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
    );

    const { result } = render();
    await waitFor(() => expect(result.current.loadState).toBe("loaded"));
  });

  it("treats an empty canonical revision as loaded, not failed", async () => {
    fetchResourceContent.mockResolvedValue({
      resourceContent: { plaintextContent: "" },
      revisions: [{ id: "rev-1", isCanonical: true }],
    });
    // A resource whose first revision holds nothing yet. `""` is falsy, so a
    // truthiness check here would show an error for a merely blank document.
    fetchRevisionContent.mockResolvedValue("");

    const { result } = render();
    await waitFor(() => expect(result.current.loadState).toBe("loaded"));
  });

  it("recovers when a retried read succeeds", async () => {
    fetchResourceContent.mockResolvedValueOnce(null);
    const { result } = render();
    await waitFor(() => expect(result.current.loadState).toBe("error"));

    fetchResourceContent.mockResolvedValue({
      resourceContent: { plaintextContent: "On disk." },
      revisions: [],
    });
    act(() => result.current.retryLoad());

    await waitFor(() => expect(result.current.loadState).toBe("loaded"));
    expect(result.current.content).toBe("On disk.");
  });
});
