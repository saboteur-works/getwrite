/**
 * note_51c813c1: a reorder whose save failed showed the new order and said
 * nothing; it was gone after a reload. `persistReorder` now tells the writer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const reorderResources = vi.fn();
vi.mock("../../src/lib/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/api/resources")>();
  return {
    ...actual,
    reorderResources: (...args: unknown[]) => reorderResources(...args),
  };
});

const toastError = vi.fn();
vi.mock("../../src/lib/toast-service", () => ({
  toastService: { error: (...args: unknown[]) => toastError(...args) },
}));

import { makeStore } from "../../src/store/store";
import { persistReorder } from "../../src/store/resourcesSlice";

const payload = {
  projectId: "aaaaaaaa-1111-4111-8111-111111111111",
  projectRoot: "/p",
  folderOrder: [],
  resourceOrder: [{ id: "r1", orderIndex: 2, folderId: null }],
};

afterEach(() => {
  reorderResources.mockReset();
  toastError.mockReset();
});

describe("persistReorder", () => {
  it("tells the writer when the new order could not be saved", async () => {
    reorderResources.mockRejectedValue(
      new Error("Failed to save the new order (500)"),
    );
    const store = makeStore();

    await store.dispatch(persistReorder(payload));

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toBe("Order not saved");
  });

  it("shows nothing when the save succeeds", async () => {
    reorderResources.mockResolvedValue(undefined);
    const store = makeStore();

    await store.dispatch(persistReorder(payload));

    expect(toastError).not.toHaveBeenCalled();
  });
});
