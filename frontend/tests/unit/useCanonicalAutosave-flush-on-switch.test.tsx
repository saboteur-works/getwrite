import { describe, it, expect, vi, beforeEach } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — renderHook exists at runtime but TS can't resolve it due to react-dom/test-utils having no types in React 19
import { renderHook, waitFor, act } from "@testing-library/react";

const patchRevisionContent = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const dispatch = vi.fn();

vi.mock("../../src/lib/api/resources", () => ({
  patchRevisionContent: (...args: unknown[]) => patchRevisionContent(...args),
}));

vi.mock("../../src/lib/toast-service", () => ({
  toastService: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock("../../src/store/hooks", () => ({
  useAppDispatch: () => dispatch,
  default: () => undefined,
}));

import { useCanonicalAutosave } from "../../components/WorkArea/useCanonicalAutosave";

/**
 * note_f13a655b: switching resource (or reloading) within the 2.5 s debounce
 * dropped the pending save; measured in the running app as text typed 300 ms
 * before a switch never reaching disk. The pending save is now flushed on
 * switch and unmount, to the resource it was typed into, and a failure of
 * that flushed save never becomes the new selection's retry state.
 */
describe("useCanonicalAutosave — pending save on switch and unmount", () => {
  const DOC_A = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
  } as never;

  type Props = { resourceId: string; revisionId: string };

  function renderAutosave(initial: Props) {
    return renderHook(
      ({ resourceId, revisionId }: Props) =>
        useCanonicalAutosave({
          projectId: "project-dir",
          selectedResourceId: resourceId,
          currentRevisionId: revisionId,
          canonicalRevisionId: revisionId,
        }),
      { initialProps: initial },
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    patchRevisionContent.mockResolvedValue({
      updatedAt: "2026-10-23T12:00:00.000Z",
    });
  });

  it("sends the pending save to the resource it was typed into when the writer switches", () => {
    const { result, rerender } = renderAutosave({
      resourceId: "resource-a",
      revisionId: "rev-a",
    });
    act(() => result.current.queueAutosave(DOC_A));
    expect(patchRevisionContent).not.toHaveBeenCalled();

    rerender({ resourceId: "resource-b", revisionId: "rev-b" });

    expect(patchRevisionContent).toHaveBeenCalledTimes(1);
    expect(patchRevisionContent).toHaveBeenCalledWith(
      "resource-a",
      "project-dir",
      "rev-a",
      JSON.stringify(DOC_A),
    );
  });

  it("sends the pending save when the editor unmounts", () => {
    const { result, unmount } = renderAutosave({
      resourceId: "resource-a",
      revisionId: "rev-a",
    });
    act(() => result.current.queueAutosave(DOC_A));

    unmount();

    expect(patchRevisionContent).toHaveBeenCalledWith(
      "resource-a",
      "project-dir",
      "rev-a",
      JSON.stringify(DOC_A),
    );
  });

  it("a flushed save that fails tells the writer and is never retried into the new resource", async () => {
    patchRevisionContent.mockRejectedValueOnce(new Error("offline"));
    const { result, rerender } = renderAutosave({
      resourceId: "resource-a",
      revisionId: "rev-a",
    });
    act(() => result.current.queueAutosave(DOC_A));

    rerender({ resourceId: "resource-b", revisionId: "rev-b" });

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][0]).toBe(
      "Your last edits to the previous document were not saved",
    );
    expect(result.current.failedSaveDoc).toBeNull();
    expect(result.current.saveStatus).not.toBe("error");

    act(() => result.current.retryFailedSave());
    expect(patchRevisionContent).toHaveBeenCalledTimes(1);
  });

  it("a flushed save that succeeds does not mark the new resource as saved", async () => {
    const { result, rerender } = renderAutosave({
      resourceId: "resource-a",
      revisionId: "rev-a",
    });
    act(() => result.current.queueAutosave(DOC_A));

    rerender({ resourceId: "resource-b", revisionId: "rev-b" });
    await waitFor(() => expect(patchRevisionContent).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe("idle");
    expect(result.current.lastSavedAt).toBeNull();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ id: "resource-a" }),
      }),
    );
  });

  it("sends the pending save when the page is about to unload (reload or close)", () => {
    const { result } = renderAutosave({
      resourceId: "resource-a",
      revisionId: "rev-a",
    });
    act(() => result.current.queueAutosave(DOC_A));

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(patchRevisionContent).toHaveBeenCalledWith(
      "resource-a",
      "project-dir",
      "rev-a",
      JSON.stringify(DOC_A),
    );
    // The page is not held open: the desktop app would cancel the close
    // silently.
    expect(event.defaultPrevented).toBe(false);
  });

  it("nothing is sent on switch when no save is pending", () => {
    const { rerender } = renderAutosave({
      resourceId: "resource-a",
      revisionId: "rev-a",
    });
    rerender({ resourceId: "resource-b", revisionId: "rev-b" });
    expect(patchRevisionContent).not.toHaveBeenCalled();
  });
});
