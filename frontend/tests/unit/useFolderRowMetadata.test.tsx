/**
 * Feature 102, Task 16 (FR-14): the hook that reads each listed folder's
 * metadata for the Data view. A failed read is `failed`, never `ready` with
 * fewer folders (`docs/standards/failure-visibility.md`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getFolderMetadata = vi.fn();
vi.mock("../../src/lib/api/folder-metadata", () => ({
  getFolderMetadata: (...args: unknown[]) => getFolderMetadata(...args),
}));

import { useFolderRowMetadata } from "../../src/hooks/useFolderRowMetadata";

beforeEach(() => {
  getFolderMetadata.mockReset();
});

describe("useFolderRowMetadata", () => {
  it("makes no request and is idle with no folder ids", () => {
    const { result } = renderHook(() => useFolderRowMetadata("proj", []));
    expect(result.current.status).toBe("idle");
    expect(getFolderMetadata).not.toHaveBeenCalled();
  });

  it("reads every folder and becomes ready", async () => {
    getFolderMetadata.mockImplementation(async (_p: string, id: string) => ({
      notes: "",
      fieldValues: { mood: id },
      resourceSubtype: undefined,
    }));
    const { result } = renderHook(() =>
      useFolderRowMetadata("proj", ["a", "b"]),
    );
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("not ready");
    expect(Object.keys(result.current.byId).sort()).toEqual(["a", "b"]);
    expect(getFolderMetadata).toHaveBeenCalledWith("proj", "a");
  });

  it("is failed with the message when any read rejects", async () => {
    getFolderMetadata.mockImplementation(async (_p: string, id: string) => {
      if (id === "b") throw new Error("sidecar unreadable");
      return { notes: "", fieldValues: {}, resourceSubtype: undefined };
    });
    const { result } = renderHook(() =>
      useFolderRowMetadata("proj", ["a", "b"]),
    );
    await waitFor(() => expect(result.current.status).toBe("failed"));
    if (result.current.status !== "failed") throw new Error("not failed");
    expect(result.current.message).toBe("sidecar unreadable");
  });
});
