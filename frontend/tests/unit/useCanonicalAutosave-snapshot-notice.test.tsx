import { describe, it, expect, vi, beforeEach } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — renderHook exists at runtime but TS can't resolve it due to react-dom/test-utils having no types in React 19
import { renderHook, waitFor, act } from "@testing-library/react";

const patchRevisionContent = vi.fn();
const toastSuccess = vi.fn();
const dispatch = vi.fn();

vi.mock("../../src/lib/api/resources", () => ({
  patchRevisionContent: (...args: unknown[]) => patchRevisionContent(...args),
}));

vi.mock("../../src/lib/toast-service", () => ({
  toastService: { success: (...args: unknown[]) => toastSuccess(...args) },
}));

vi.mock("../../src/store/hooks", () => ({
  useAppDispatch: () => dispatch,
  default: () => undefined,
}));

import { useCanonicalAutosave } from "../../components/WorkArea/useCanonicalAutosave";

/**
 * A backup nobody is told about is only half a safety net: the writer has just
 * watched their document collapse, and the revision list is the last place
 * they would think to look unaided. These assert the two things that make the
 * preserved revision reachable in the moment — the notice, and the refetch
 * that puts the new revision in the panel without a reload.
 */
describe("useCanonicalAutosave — destructive-save notice", () => {
  const DOC = { type: "doc", content: [] } as never;
  /** Comfortably past `useCanonicalAutosave`'s own 2500ms save debounce. */
  const DEBOUNCE_ALLOWANCE_MS = 5000;

  function renderAutosave(onSnapshotCreated?: () => void) {
    return renderHook(() =>
      useCanonicalAutosave({
        projectId: "project-dir",
        selectedResourceId: "resource-1",
        currentRevisionId: "rev-1",
        canonicalRevisionId: "rev-1",
        onSnapshotCreated,
      }),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tells the writer and refreshes the list when a backup was taken", async () => {
    patchRevisionContent.mockResolvedValue({
      updatedAt: "2026-09-23T19:33:24.000Z",
      snapshotCreated: true,
    });
    const onSnapshotCreated = vi.fn();
    const { result } = renderAutosave(onSnapshotCreated);

    act(() => result.current.queueAutosave(DOC));

    // The hook debounces the write by 2500ms, past waitFor's 1s default.
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1), {
      timeout: DEBOUNCE_ALLOWANCE_MS,
    });
    expect(toastSuccess.mock.calls[0][0]).toBe(
      "Saved a backup of your previous content",
    );
    // Names where to find it, so the notice is actionable rather than a fact.
    expect(toastSuccess.mock.calls[0][1]).toContain(
      "Auto-backup before large deletion",
    );
    expect(onSnapshotCreated).toHaveBeenCalledTimes(1);
  }, 10000);

  it("stays silent on an ordinary save", async () => {
    patchRevisionContent.mockResolvedValue({
      updatedAt: "2026-09-23T19:33:24.000Z",
    });
    const onSnapshotCreated = vi.fn();
    const { result } = renderAutosave(onSnapshotCreated);

    act(() => result.current.queueAutosave(DOC));

    await waitFor(() => expect(result.current.saveStatus).toBe("saved"), {
      timeout: DEBOUNCE_ALLOWANCE_MS,
    });
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onSnapshotCreated).not.toHaveBeenCalled();
  }, 10000);
});
