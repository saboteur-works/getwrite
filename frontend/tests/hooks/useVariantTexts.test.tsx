/** @vitest-environment jsdom */
/**
 * Feature 110, Task 16 (FR-13, FR-15, FR-16): the variant texts hook. Fakes
 * only (injected reads); nothing here is evidence about a device.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useVariantTexts,
  type VariantTextsDeps,
  type VariantTextsState,
} from "../../components/Folklore/useVariantTexts";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import type { VariantTextResult } from "../../src/lib/models/folklore-types";

const PID = "proj-1";

function attachment(id: string, mime: string, name = `${id}.bin`) {
  return {
    id,
    fileName: name,
    originalName: name,
    mime,
    size: 10,
    addedAt: "2026-11-01T00:00:00.000Z",
  };
}

function makeDeps(
  texts: Record<string, VariantTextResult | Error>,
  attachments: Record<string, ReturnType<typeof attachment>[] | Error> = {},
): VariantTextsDeps & {
  readVariantText: ReturnType<typeof vi.fn>;
  listAttachments: ReturnType<typeof vi.fn>;
} {
  return {
    readVariantText: vi.fn(async (_p: string, id: string) => {
      const v = texts[id];
      if (v instanceof Error) throw v;
      return v ?? { kind: "unreadable", reason: "missing fake" };
    }),
    listAttachments: vi.fn(async (_p: string, id: string) => {
      const v = attachments[id];
      if (v instanceof Error) throw v;
      return v ?? [];
    }),
  };
}

async function ready(result: {
  current: VariantTextsState;
}): Promise<Extract<VariantTextsState, { status: "ready" }>> {
  await waitFor(() => expect(result.current.status).not.toBe("loading"));
  const s = result.current;
  if (s.status !== "ready") throw new Error(`state was ${s.status}`);
  return s;
}

describe("useVariantTexts", () => {
  it("returns each chosen variant's typed result in order", async () => {
    const deps = makeDeps({
      a: { kind: "text", text: "tale a" },
      b: { kind: "text", text: "tale b" },
    });
    const { result } = renderHook(() =>
      useVariantTexts({
        projectId: PID,
        variantIds: ["a", "b"],
        enabled: true,
        deps,
      }),
    );
    const s = await ready(result);
    expect(s.variants.map((v) => [v.id, v.content])).toEqual([
      ["a", { kind: "text", text: "tale a" }],
      ["b", { kind: "text", text: "tale b" }],
    ]);
    expect(s.notRead).toEqual([]);
    expect(deps.listAttachments).not.toHaveBeenCalled();
  });

  it("collects a failed variant in notRead while the others return", async () => {
    const deps = makeDeps({
      a: { kind: "text", text: "tale a" },
      b: new Error("disk read failed"),
      c: { kind: "unreadable", reason: "not a document" },
    });
    const { result } = renderHook(() =>
      useVariantTexts({
        projectId: PID,
        variantIds: ["a", "b", "c"],
        enabled: true,
        deps,
      }),
    );
    const s = await ready(result);
    expect(s.variants[0].content).toEqual({ kind: "text", text: "tale a" });
    expect(s.variants[1].content).toEqual({
      kind: "unreadable",
      reason: "disk read failed",
    });
    expect(s.notRead).toEqual([
      { id: "b", reason: "disk read failed" },
      { id: "c", reason: "not a document" },
    ]);
  });

  it("is a locked state for a locked project, never no text", async () => {
    const locked = new ProjectLockedError(PID);
    const deps = makeDeps({ a: { kind: "text", text: "x" }, b: locked });
    const { result } = renderHook(() =>
      useVariantTexts({
        projectId: PID,
        variantIds: ["a", "b"],
        enabled: true,
        deps,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("locked"));
    const s = result.current;
    expect(s.status === "locked" && s.error).toBe(locked);
  });

  it("treats a locked result and a missing-key error as locked", async () => {
    const deps = makeDeps({ a: { kind: "locked" } });
    const first = renderHook(() =>
      useVariantTexts({
        projectId: PID,
        variantIds: ["a"],
        enabled: true,
        deps,
      }),
    );
    await waitFor(() => expect(first.result.current.status).toBe("locked"));
    const key = new MissingProjectKeyError(PID);
    const deps2 = makeDeps({ a: key });
    const second = renderHook(() =>
      useVariantTexts({
        projectId: PID,
        variantIds: ["a"],
        enabled: true,
        deps: deps2,
      }),
    );
    await waitFor(() => expect(second.result.current.status).toBe("locked"));
  });

  it("reads the attachment list only for an empty body, audio only", async () => {
    const deps = makeDeps(
      {
        a: { kind: "text", text: "x" },
        b: { kind: "none" },
        c: { kind: "none" },
      },
      {
        b: [
          attachment("f1", "audio/mpeg", "tale.mp3"),
          attachment("f2", "image/png"),
        ],
        c: [attachment("f3", "image/png")],
      },
    );
    const { result } = renderHook(() =>
      useVariantTexts({
        projectId: PID,
        variantIds: ["a", "b", "c"],
        enabled: true,
        deps,
      }),
    );
    const s = await ready(result);
    expect(deps.listAttachments).toHaveBeenCalledTimes(2);
    expect(deps.listAttachments).not.toHaveBeenCalledWith(PID, "a");
    expect(s.variants[0].audio).toEqual({ kind: "none" });
    expect(s.variants[1].audio).toEqual({
      kind: "available",
      attachments: [{ id: "f1", name: "tale.mp3" }],
    });
    expect(s.variants[2].audio).toEqual({ kind: "none" });
  });

  it("returns a failed attachment list read as a failure, not no audio", async () => {
    const deps = makeDeps(
      { b: { kind: "none" } },
      { b: new Error("attachments unreadable") },
    );
    const { result } = renderHook(() =>
      useVariantTexts({
        projectId: PID,
        variantIds: ["b"],
        enabled: true,
        deps,
      }),
    );
    const s = await ready(result);
    expect(s.variants[0].audio).toEqual({
      kind: "failed",
      reason: "attachments unreadable",
    });
    expect(s.notRead).toEqual([{ id: "b", reason: "attachments unreadable" }]);
  });

  it("is locked when the attachment list read finds a locked project", async () => {
    const deps = makeDeps(
      { b: { kind: "none" } },
      { b: new ProjectLockedError(PID) },
    );
    const { result } = renderHook(() =>
      useVariantTexts({
        projectId: PID,
        variantIds: ["b"],
        enabled: true,
        deps,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("locked"));
  });

  it("starts no read when enabled is false", async () => {
    const deps = makeDeps({ a: { kind: "text", text: "x" } });
    const { result } = renderHook(() =>
      useVariantTexts({
        projectId: PID,
        variantIds: ["a"],
        enabled: false,
        deps,
      }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.status).toBe("idle");
    expect(deps.readVariantText).not.toHaveBeenCalled();
    expect(deps.listAttachments).not.toHaveBeenCalled();
  });

  it("reads once enabled turns true and never more than the ids passed", async () => {
    const deps = makeDeps({
      a: { kind: "text", text: "x" },
      b: { kind: "text", text: "y" },
    });
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useVariantTexts({
          projectId: PID,
          variantIds: ["a", "b"],
          enabled,
          deps,
        }),
      { initialProps: { enabled: false } },
    );
    expect(deps.readVariantText).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await ready(result);
    expect(deps.readVariantText).toHaveBeenCalledTimes(2);
    const ids = deps.readVariantText.mock.calls.map((c) => c[1]).sort();
    expect(ids).toEqual(["a", "b"]);
  });

  it("reads nothing for an empty selection", async () => {
    const deps = makeDeps({});
    const { result } = renderHook(() =>
      useVariantTexts({ projectId: PID, variantIds: [], enabled: true, deps }),
    );
    expect(result.current).toEqual({
      status: "ready",
      variants: [],
      notRead: [],
    });
    expect(deps.readVariantText).not.toHaveBeenCalled();
  });

  it("names every variant as not read when no project is open", () => {
    const deps = makeDeps({});
    const { result } = renderHook(() =>
      useVariantTexts({
        projectId: null,
        variantIds: ["a"],
        enabled: true,
        deps,
      }),
    );
    const s = result.current;
    expect(s.status === "ready" && s.notRead.map((n) => n.id)).toEqual(["a"]);
    expect(deps.readVariantText).not.toHaveBeenCalled();
  });
});
