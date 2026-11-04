/**
 * @module editorPositionMemory.test
 *
 * Tests for `components/Editor/editorPositionMemory.ts`: the pure choice of
 * the selection to restore, and the in-memory store of positions by project
 * and document (`specs/features/editor-position-memory.md`, FR-1, FR-2,
 * FR-3, FR-10). No editor is created, in line with this repo's rule for
 * jsdom tests.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type PositionMemory =
  typeof import("../../components/Editor/editorPositionMemory");

async function freshModule(): Promise<PositionMemory> {
  vi.resetModules();
  return import("../../components/Editor/editorPositionMemory");
}

describe("resolveRestoredSelection", () => {
  let memory: PositionMemory;
  beforeEach(async () => {
    memory = await freshModule();
  });

  it("returns position 0 when there is no record", () => {
    expect(memory.resolveRestoredSelection(null, 120)).toEqual({
      anchor: 0,
      head: 0,
    });
  });

  it("returns a collapsed record inside the document unchanged", () => {
    expect(
      memory.resolveRestoredSelection({ anchor: 42, head: 42 }, 120),
    ).toEqual({ anchor: 42, head: 42 });
  });

  it("returns a ranged record inside the document unchanged, in either direction", () => {
    expect(
      memory.resolveRestoredSelection({ anchor: 10, head: 30 }, 120),
    ).toEqual({ anchor: 10, head: 30 });
    expect(
      memory.resolveRestoredSelection({ anchor: 30, head: 10 }, 120),
    ).toEqual({ anchor: 30, head: 10 });
  });

  it("clamps each end beyond the document size to the size", () => {
    expect(
      memory.resolveRestoredSelection({ anchor: 90, head: 200 }, 100),
    ).toEqual({ anchor: 90, head: 100 });
    expect(
      memory.resolveRestoredSelection({ anchor: 500, head: 400 }, 100),
    ).toEqual({ anchor: 100, head: 100 });
  });

  it("clamps negative and non-finite values to 0", () => {
    expect(
      memory.resolveRestoredSelection({ anchor: -5, head: Number.NaN }, 100),
    ).toEqual({ anchor: 0, head: 0 });
  });

  it("treats a negative document size as an empty document", () => {
    expect(memory.resolveRestoredSelection({ anchor: 5, head: 5 }, -1)).toEqual(
      { anchor: 0, head: 0 },
    );
  });
});

describe("position store", () => {
  let memory: PositionMemory;
  beforeEach(async () => {
    memory = await freshModule();
  });

  it("returns null for a key with no record", () => {
    expect(memory.getEditorPosition("p:d")).toBeNull();
  });

  it("round-trips a collapsed and a ranged position", () => {
    memory.recordEditorPosition("p:a", { anchor: 7, head: 7, scrollTop: 0 });
    memory.recordEditorPosition("p:b", { anchor: 3, head: 19, scrollTop: 640 });
    expect(memory.getEditorPosition("p:a")).toEqual({
      anchor: 7,
      head: 7,
      scrollTop: 0,
    });
    expect(memory.getEditorPosition("p:b")).toEqual({
      anchor: 3,
      head: 19,
      scrollTop: 640,
    });
  });

  it("replaces the record for a key", () => {
    memory.recordEditorPosition("p:a", { anchor: 1, head: 1, scrollTop: 10 });
    memory.recordEditorPosition("p:a", { anchor: 9, head: 9, scrollTop: 90 });
    expect(memory.getEditorPosition("p:a")).toEqual({
      anchor: 9,
      head: 9,
      scrollTop: 90,
    });
  });

  it("keeps the same document id in two projects apart", () => {
    const inFirst = memory.editorPositionKey("project-1", "doc");
    const inSecond = memory.editorPositionKey("project-2", "doc");
    expect(inFirst).not.toBe(inSecond);
    memory.recordEditorPosition(inFirst, { anchor: 5, head: 5, scrollTop: 50 });
    expect(memory.getEditorPosition(inSecond)).toBeNull();
  });

  it("returns a copy, so a caller cannot change the stored record", () => {
    memory.recordEditorPosition("p:a", { anchor: 4, head: 4, scrollTop: 40 });
    const got = memory.getEditorPosition("p:a");
    if (got) got.anchor = 99;
    expect(memory.getEditorPosition("p:a")?.anchor).toBe(4);
  });

  it("starts with no records on a fresh module load (a reload or restart)", async () => {
    memory.recordEditorPosition("p:a", { anchor: 4, head: 4, scrollTop: 40 });
    const reloaded = await freshModule();
    expect(reloaded.getEditorPosition("p:a")).toBeNull();
  });
});

describe("storage (FR-2)", () => {
  it("uses no browser storage", () => {
    const source = readFileSync(
      path.resolve(
        __dirname,
        "../../components/Editor/editorPositionMemory.ts",
      ),
      "utf8",
    );
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
  });
});
