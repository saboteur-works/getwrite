/**
 * Feature 109, Task 16 (FR-12, OQ-18): excerpts and folder sidecars are
 * requested only for the cards shown after the cap and the filters. A failed
 * read is a failure state, never an empty body or a hidden card
 * (`docs/standards/failure-visibility.md`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { OrganizerSource } from "../src/lib/models/organizer-grid-types";

const fetchResourceExcerptsOrThrow = vi.fn();
vi.mock("../src/lib/api/resource-excerpts", () => ({
  fetchResourceExcerptsOrThrow: (...args: unknown[]) =>
    fetchResourceExcerptsOrThrow(...args),
}));
const getFolderMetadata = vi.fn();
vi.mock("../src/lib/api/folder-metadata", () => ({
  getFolderMetadata: (...args: unknown[]) => getFolderMetadata(...args),
}));

import {
  useOrganizerShownCardData,
  type UseOrganizerShownCardDataInput,
} from "../components/WorkArea/Views/OrganizerView/useOrganizerShownCardData";
import { applyCardCap } from "../components/WorkArea/Views/OrganizerView/organizerGridCap";

const CHILDREN: OrganizerSource = {
  kind: "folder",
  folderId: "root",
  scope: "children",
};
const DESCENDANTS: OrganizerSource = {
  kind: "folder",
  folderId: "root",
  scope: "descendants",
};
const SMART: OrganizerSource = { kind: "smart-folder", queryId: "q" };

const ids = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

function input(
  over: Partial<UseOrganizerShownCardDataInput> = {},
): UseOrganizerShownCardDataInput {
  return {
    projectId: "proj",
    source: CHILDREN,
    shownTextIds: ["t1"],
    shownFolderIds: ["f1"],
    isExcerptWanted: true,
    excerptLength: 120,
    ...over,
  };
}

beforeEach(() => {
  fetchResourceExcerptsOrThrow.mockReset();
  getFolderMetadata.mockReset();
  fetchResourceExcerptsOrThrow.mockImplementation(
    async (_p: string, requested: string[]) =>
      Object.fromEntries(requested.map((id) => [id, `body ${id}`])),
  );
  getFolderMetadata.mockImplementation(async () => ({
    notes: "",
    fieldValues: {},
    resourceSubtype: undefined,
  }));
});

describe("useOrganizerShownCardData", () => {
  it("with 600 cards and a cap of 100 requests only the shown ids", async () => {
    const texts = ids("t", 400);
    const folders = ids("f", 200);
    const all = [...texts, ...folders];
    const { shown } = applyCardCap(all.length, 100);
    const shownSet = new Set(all.slice(0, shown));
    const shownTextIds = texts.filter((id) => shownSet.has(id));
    const shownFolderIds = folders.filter((id) => shownSet.has(id));
    expect(all).toHaveLength(600);
    expect(shownTextIds.length + shownFolderIds.length).toBe(100);

    // Interleave so both kinds are partly shown and partly cut.
    const mixedShownTexts = texts.slice(0, 60);
    const mixedShownFolders = folders.slice(0, 40);
    const { result } = renderHook(() =>
      useOrganizerShownCardData(
        input({
          shownTextIds: mixedShownTexts,
          shownFolderIds: mixedShownFolders,
        }),
      ),
    );
    await waitFor(() => expect(result.current.excerpts.status).toBe("ready"));
    await waitFor(() => expect(result.current.folders.status).toBe("ready"));

    expect(fetchResourceExcerptsOrThrow).toHaveBeenCalledTimes(1);
    expect(fetchResourceExcerptsOrThrow.mock.calls[0][1]).toEqual(
      mixedShownTexts,
    );
    expect(fetchResourceExcerptsOrThrow.mock.calls[0][2]).toBe(120);
    expect(getFolderMetadata).toHaveBeenCalledTimes(mixedShownFolders.length);
    const read = getFolderMetadata.mock.calls.map((c) => c[1] as string);
    expect([...read].sort()).toEqual([...mixedShownFolders].sort());
  });

  it("re-requests for the new shown set when a filter changes it", async () => {
    const { result, rerender } = renderHook(
      (p: UseOrganizerShownCardDataInput) => useOrganizerShownCardData(p),
      {
        initialProps: input({
          shownTextIds: ["a", "b"],
          shownFolderIds: ["f1"],
        }),
      },
    );
    await waitFor(() => expect(result.current.excerpts.status).toBe("ready"));
    rerender(input({ shownTextIds: ["b"], shownFolderIds: ["f2"] }));
    await waitFor(() =>
      expect(fetchResourceExcerptsOrThrow).toHaveBeenCalledTimes(2),
    );
    expect(fetchResourceExcerptsOrThrow.mock.calls[1][1]).toEqual(["b"]);
    await waitFor(() =>
      expect(getFolderMetadata.mock.calls.map((c) => c[1])).toContain("f2"),
    );
    await waitFor(() => {
      const s = result.current.excerpts;
      expect(s.status === "ready" && Object.keys(s.byId)).toEqual(["b"]);
    });
  });

  it("returns a failure state when the excerpt read rejects", async () => {
    fetchResourceExcerptsOrThrow.mockRejectedValue(new Error("excerpts down"));
    const { result } = renderHook(() => useOrganizerShownCardData(input()));
    await waitFor(() => expect(result.current.excerpts.status).toBe("failed"));
    expect(result.current.excerpts).toEqual({
      status: "failed",
      message: "excerpts down",
    });
  });

  it("does not report a failed excerpt read as ready with an empty map", async () => {
    fetchResourceExcerptsOrThrow.mockRejectedValue("not an error");
    const { result } = renderHook(() => useOrganizerShownCardData(input()));
    await waitFor(() => expect(result.current.excerpts.status).toBe("failed"));
    expect(result.current.excerpts).not.toHaveProperty("byId");
  });

  it("returns a failure state when a folder-sidecar read rejects", async () => {
    getFolderMetadata.mockRejectedValue(new Error("sidecar unreadable"));
    const { result } = renderHook(() => useOrganizerShownCardData(input()));
    await waitFor(() => expect(result.current.folders.status).toBe("failed"));
    expect(result.current.folders).toEqual({
      status: "failed",
      message: "sidecar unreadable",
    });
  });

  it.each([
    ["descendants", DESCENDANTS],
    ["smart-folder", SMART],
  ])("makes no folder reads for a %s source", async (_n, source) => {
    const { result } = renderHook(() =>
      useOrganizerShownCardData(input({ source, shownFolderIds: ["f1"] })),
    );
    await waitFor(() => expect(result.current.excerpts.status).toBe("ready"));
    expect(result.current.folders.status).toBe("idle");
    expect(getFolderMetadata).not.toHaveBeenCalled();
  });

  it("makes no excerpt request when bodies are not wanted or nothing is shown", () => {
    const off = renderHook(() =>
      useOrganizerShownCardData(input({ isExcerptWanted: false })),
    );
    expect(off.result.current.excerpts.status).toBe("idle");
    const none = renderHook(() =>
      useOrganizerShownCardData(input({ shownTextIds: [] })),
    );
    expect(none.result.current.excerpts.status).toBe("idle");
    const noProject = renderHook(() =>
      useOrganizerShownCardData(input({ projectId: "" })),
    );
    expect(noProject.result.current.excerpts.status).toBe("idle");
    expect(fetchResourceExcerptsOrThrow).not.toHaveBeenCalled();
  });

  it("discards a stale excerpt result for an earlier shown set", async () => {
    let resolveFirst: (v: Record<string, string>) => void = () => {};
    fetchResourceExcerptsOrThrow.mockImplementationOnce(
      () =>
        new Promise<Record<string, string>>((r) => {
          resolveFirst = r;
        }),
    );
    const { result, rerender } = renderHook(
      (p: UseOrganizerShownCardDataInput) => useOrganizerShownCardData(p),
      { initialProps: input({ shownTextIds: ["old"] }) },
    );
    rerender(input({ shownTextIds: ["new"] }));
    await waitFor(() => expect(result.current.excerpts.status).toBe("ready"));
    resolveFirst({ old: "stale" });
    await new Promise((r) => setTimeout(r, 0));
    const s = result.current.excerpts;
    expect(s.status === "ready" && Object.keys(s.byId)).toEqual(["new"]);
  });
});
