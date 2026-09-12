/**
 * The main-process registry that tracks the one active `.scriv` selection
 * handle. Runtime-free, so this runs against plain in-memory state — no
 * filesystem, no Electron.
 */
import { describe, it, expect } from "vitest";
import { createSelectionHandleRegistry } from "../../src/scrivener-import/selection-handles";

describe("createSelectionHandleRegistry", () => {
  it("returns an opaque handle that never encodes the path, with the display name retrievable via resolve", () => {
    const registry = createSelectionHandleRegistry();
    const path = "/Users/writer/Manuscripts/My Novel.scriv";

    const handle = registry.record(path, "My Novel");

    // Opaque: not the path itself, and not a string that contains it either
    // (e.g. a path suffix or base64/URI-encoded form).
    expect(handle).not.toBe(path);
    expect(handle).not.toContain(path);
    expect(path).not.toContain(handle);

    expect(registry.resolve(handle)).toEqual({ path, displayName: "My Novel" });
  });

  it("resolves a valid, unconsumed handle to its path and display name", () => {
    const registry = createSelectionHandleRegistry();
    const handle = registry.record("/a/b/Project.scriv", "Project");

    expect(registry.resolve(handle)).toEqual({
      path: "/a/b/Project.scriv",
      displayName: "Project",
    });
  });

  it("invalidates the prior handle when a second selection is recorded", () => {
    const registry = createSelectionHandleRegistry();
    const first = registry.record("/a/First.scriv", "First");
    const second = registry.record("/b/Second.scriv", "Second");

    expect(registry.resolve(first)).toBeNull();
    expect(registry.consume(first)).toBe(false);

    // The new handle is unaffected.
    expect(registry.resolve(second)).toEqual({
      path: "/b/Second.scriv",
      displayName: "Second",
    });
  });

  it("returns false and does not re-fire when consuming an already-consumed handle", () => {
    const registry = createSelectionHandleRegistry();
    const handle = registry.record("/a/Project.scriv", "Project");

    expect(registry.consume(handle)).toBe(true);
    // A second consume must not "un-invalidate" or double-trigger anything —
    // it simply reports failure, and the handle stays dead.
    expect(registry.consume(handle)).toBe(false);
    expect(registry.resolve(handle)).toBeNull();
  });

  it("treats an unknown handle as invalid", () => {
    const registry = createSelectionHandleRegistry();

    expect(registry.resolve("not-a-real-handle")).toBeNull();
    expect(registry.consume("not-a-real-handle")).toBe(false);
  });
});
