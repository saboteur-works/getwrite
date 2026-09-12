// Last Updated: 2026-09-12

/**
 * The main-process half of the Scrivener import start/finish guard: it must
 * refuse a second concurrent import and must reopen once the first one
 * finishes.
 */
import { describe, it, expect } from "vitest";
import { createImportGuard } from "../../src/scrivener-import/import-guard";

describe("createImportGuard", () => {
  it("returns true once, then false on a second call before finish()", () => {
    const guard = createImportGuard();

    expect(guard.tryStart()).toBe(true);
    expect(guard.tryStart()).toBe(false);
  });

  it("returns true again after finish() has been called", () => {
    const guard = createImportGuard();

    expect(guard.tryStart()).toBe(true);
    guard.finish();
    expect(guard.tryStart()).toBe(true);
  });

  it("keeps separate guards independent of each other", () => {
    const first = createImportGuard();
    const second = createImportGuard();

    expect(first.tryStart()).toBe(true);

    // A second guard instance is not in flight just because another one is.
    expect(second.tryStart()).toBe(true);
  });
});
