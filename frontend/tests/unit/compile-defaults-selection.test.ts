/**
 * Feature 101, Task 5 (FR-4, FR-6): initial selection from saved exclusions.
 */
import { describe, expect, it } from "vitest";
import { resolveInitialSelection } from "../../components/common/compile-defaults-selection";

const ALL = ["a", "b", "c"];

describe("resolveInitialSelection", () => {
  it("selects every resource when the saved list is absent", () => {
    const r = resolveInitialSelection(ALL, undefined);
    expect([...r.selectedIds]).toEqual(ALL);
    expect(r.leftOutIds).toEqual([]);
  });

  it("selects every resource when the saved list is empty", () => {
    expect([...resolveInitialSelection(ALL, []).selectedIds]).toEqual(ALL);
  });

  it("selects everything except the excluded ids", () => {
    const r = resolveInitialSelection(ALL, ["b"]);
    expect([...r.selectedIds]).toEqual(["a", "c"]);
    expect(r.leftOutIds).toEqual(["b"]);
  });

  it("drops ids of resources that no longer exist, without error", () => {
    const r = resolveInitialSelection(ALL, ["gone", "b", "also-gone"]);
    expect([...r.selectedIds]).toEqual(["a", "c"]);
    expect(r.leftOutIds).toEqual(["b"]);
  });

  it("does not mutate its inputs", () => {
    const saved = ["gone", "b"];
    resolveInitialSelection(ALL, saved);
    expect(saved).toEqual(["gone", "b"]);
    expect(ALL).toEqual(["a", "b", "c"]);
  });

  it("treats every id alike, whatever the resource is", () => {
    const r = resolveInitialSelection(["x", "y"], ["x", "y"]);
    expect(r.selectedIds.size).toBe(0);
    expect(r.leftOutIds).toEqual(["x", "y"]);
  });
});
