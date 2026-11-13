/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFolkloreSelection,
  folkloreSelectionStorageKey,
  readFolkloreSelection,
  resolveFolkloreSelection,
  writeFolkloreSelection,
} from "../../src/lib/folklore-selection-preference";

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";
const NARRATIVE = "33333333-3333-4333-8333-333333333333";
const V1 = "44444444-4444-4444-8444-444444444444";
const V2 = "55555555-5555-4555-8555-555555555555";
const V3 = "66666666-6666-4666-8666-666666666666";

describe("folklore-selection-preference", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("keys by project directory id under a folklore-specific name", () => {
    expect(folkloreSelectionStorageKey(PROJECT_A)).toBe(
      `getwrite-folklore-selection:${PROJECT_A}`,
    );
  });

  it("round-trips the narrative and the variants in chosen order", () => {
    expect(
      writeFolkloreSelection(PROJECT_A, {
        narrativeId: NARRATIVE,
        variantIds: [V2, V1],
      }),
    ).toBe(true);
    expect(readFolkloreSelection(PROJECT_A)).toEqual({
      status: "stored",
      selection: { narrativeId: NARRATIVE, variantIds: [V2, V1] },
    });
  });

  it("reads 'none' when nothing is stored, and does not write", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    expect(readFolkloreSelection(PROJECT_A)).toEqual({ status: "none" });
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("does not share a value between projects", () => {
    writeFolkloreSelection(PROJECT_A, {
      narrativeId: NARRATIVE,
      variantIds: [V1],
    });
    expect(readFolkloreSelection(PROJECT_B)).toEqual({ status: "none" });
  });

  it("reads a malformed value or project id as none, never writing", () => {
    const key = folkloreSelectionStorageKey(PROJECT_A);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    for (const bad of [
      "",
      "not json",
      "[]",
      "null",
      '{"narrativeId":1,"variantIds":[]}',
      '{"narrativeId":"../x","variantIds":[]}',
      '{"narrativeId":null,"variantIds":"a"}',
    ]) {
      window.localStorage.setItem(key, bad);
      setItem.mockClear();
      expect(readFolkloreSelection(PROJECT_A)).toEqual({ status: "none" });
      expect(setItem).not.toHaveBeenCalled();
    }
    expect(readFolkloreSelection("../etc")).toEqual({ status: "none" });
  });

  it("drops malformed and duplicate variant ids but keeps the rest", () => {
    window.localStorage.setItem(
      folkloreSelectionStorageKey(PROJECT_A),
      JSON.stringify({
        narrativeId: NARRATIVE,
        variantIds: [V1, "bad id", V1, V2, 5],
      }),
    );
    expect(readFolkloreSelection(PROJECT_A)).toEqual({
      status: "stored",
      selection: { narrativeId: NARRATIVE, variantIds: [V1, V2] },
    });
  });

  it("accepts a null narrative with no variants", () => {
    writeFolkloreSelection(PROJECT_A, { narrativeId: null, variantIds: [] });
    expect(readFolkloreSelection(PROJECT_A)).toEqual({
      status: "stored",
      selection: { narrativeId: null, variantIds: [] },
    });
  });

  it("refuses to write a malformed project or id and writes nothing", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    expect(
      writeFolkloreSelection("../x", { narrativeId: null, variantIds: [] }),
    ).toBe(false);
    expect(
      writeFolkloreSelection(PROJECT_A, { narrativeId: "a b", variantIds: [] }),
    ).toBe(false);
    expect(
      writeFolkloreSelection(PROJECT_A, {
        narrativeId: NARRATIVE,
        variantIds: ["a b"],
      }),
    ).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("reports 'unreadable' on a read failure, distinct from none", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readFolkloreSelection(PROJECT_A)).toEqual({ status: "unreadable" });
  });

  it("returns false and does not throw when a write or clear fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(
      writeFolkloreSelection(PROJECT_A, {
        narrativeId: NARRATIVE,
        variantIds: [V1],
      }),
    ).toBe(false);
    expect(clearFolkloreSelection(PROJECT_A)).toBe(false);
  });

  it("clears the stored selection", () => {
    writeFolkloreSelection(PROJECT_A, {
      narrativeId: NARRATIVE,
      variantIds: [V1],
    });
    expect(clearFolkloreSelection(PROJECT_A)).toBe(true);
    expect(readFolkloreSelection(PROJECT_A)).toEqual({ status: "none" });
  });

  it("writes only under its own key", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    writeFolkloreSelection(PROJECT_A, {
      narrativeId: NARRATIVE,
      variantIds: [V1],
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0][0]).toBe(
      folkloreSelectionStorageKey(PROJECT_A),
    );
  });

  describe("resolveFolkloreSelection", () => {
    it("keeps ids that still name a variant, with no choice lost", () => {
      expect(
        resolveFolkloreSelection(
          { narrativeId: NARRATIVE, variantIds: [V2, V1] },
          [V1, V2, V3],
        ),
      ).toEqual({
        selection: { narrativeId: NARRATIVE, variantIds: [V2, V1] },
        choiceLost: false,
        lostVariantIds: [],
      });
    });

    it("reads a removed variant as absent and flags the choice as lost", () => {
      expect(
        resolveFolkloreSelection(
          { narrativeId: NARRATIVE, variantIds: [V1, V3, V2] },
          [V1, V2],
        ),
      ).toEqual({
        selection: { narrativeId: NARRATIVE, variantIds: [V1, V2] },
        choiceLost: true,
        lostVariantIds: [V3],
      });
    });

    it("flags the choice lost when the narrative has no variants left", () => {
      const r = resolveFolkloreSelection(
        { narrativeId: NARRATIVE, variantIds: [V1] },
        [],
      );
      expect(r.selection.variantIds).toEqual([]);
      expect(r.choiceLost).toBe(true);
    });

    it("has nothing to lose when no variants were chosen", () => {
      expect(
        resolveFolkloreSelection({ narrativeId: null, variantIds: [] }, [V1])
          .choiceLost,
      ).toBe(false);
    });
  });
});
