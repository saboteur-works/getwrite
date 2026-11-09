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
  toastService: {
    error: (...args: unknown[]) => toastError(...args),
    info: (...args: unknown[]) => toastInfo(...args),
  },
}));
const toastInfo = vi.fn();

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
  toastInfo.mockReset();
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

  it("shows the compile-default notice as its own message, not the failure message (FR-23)", async () => {
    const notice =
      "The item was moved, but its saved compile default was not cleared.";
    reorderResources.mockResolvedValue({ notice });
    const store = makeStore();

    const result = await store.dispatch(persistReorder(payload));

    expect(result.type).toBe("projects/persistReorder/fulfilled");
    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastInfo.mock.calls[0][0]).toBe(
      `Compile default not cleared\n${notice}`,
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows nothing new when the response has no notice", async () => {
    reorderResources.mockResolvedValue({});
    const store = makeStore();

    await store.dispatch(persistReorder(payload));

    expect(toastInfo).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("a failed move shows the failure message and no notice", async () => {
    reorderResources.mockRejectedValue(new Error("boom"));
    const store = makeStore();

    await store.dispatch(persistReorder(payload));

    expect(toastError.mock.calls[0][0]).toBe("Order not saved");
    expect(toastInfo).not.toHaveBeenCalled();
  });
});
