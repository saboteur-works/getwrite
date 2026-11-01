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
import { flushPendingSaves } from "../../src/lib/pending-saves";

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

describe("useCanonicalAutosave — flushPendingSaves (desktop window close)", () => {
  const DOC = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
  } as never;
  const PROPS = {
    projectId: "p1",
    selectedResourceId: "r1",
    currentRevisionId: "v1",
    canonicalRevisionId: "v1",
  };

  beforeEach(() => {
    patchRevisionContent.mockReset();
  });

  it("sends the waiting save and reports when it has finished", async () => {
    let finish: (value: unknown) => void = () => {};
    patchRevisionContent.mockReturnValue(
      new Promise((resolve) => (finish = resolve)),
    );
    const { result } = renderHook(() => useCanonicalAutosave(PROPS as never));
    act(() => result.current.queueAutosave(DOC));

    let isFlushed: boolean | undefined;
    const flush = flushPendingSaves().then((ok) => (isFlushed = ok));
    await waitFor(() => expect(patchRevisionContent).toHaveBeenCalledOnce());
    expect(isFlushed).toBeUndefined();
    finish({});
    await flush;
    expect(isFlushed).toBe(true);
  });

  it("reports failure when the waiting save fails", async () => {
    patchRevisionContent.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useCanonicalAutosave(PROPS as never));
    act(() => result.current.queueAutosave(DOC));
    await expect(flushPendingSaves()).resolves.toBe(false);
  });

  it("tries a save that failed earlier again", async () => {
    patchRevisionContent.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useCanonicalAutosave(PROPS as never));
    act(() => result.current.saveNow(DOC));
    await waitFor(() => expect(result.current.saveStatus).toBe("error"));

    patchRevisionContent.mockResolvedValueOnce({});
    await expect(flushPendingSaves()).resolves.toBe(true);
    expect(patchRevisionContent).toHaveBeenCalledTimes(2);
  });
});
