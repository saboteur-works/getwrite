/**
 * Feature 110, Task 4: the folklore contract constants and result types.
 */
import { describe, expect, it } from "vitest";
import {
  COMPARISON_PHONE_MESSAGE,
  FOLKLORE_MODULE_ID,
  FOLKLORE_VIEW_LABEL,
  NARRATIVE_SUBTYPE,
  NOT_IN_LIST,
  NOT_SET,
  VARIANT_SUBTYPE,
  type FolkloreSelection,
  type VariantTextResult,
} from "../../src/lib/models/folklore-types";

describe("folklore-types constants", () => {
  it("module id is well formed", () => {
    expect(FOLKLORE_MODULE_ID).toBe("folklore");
    expect(FOLKLORE_MODULE_ID).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
  });

  it("labels and subtypes", () => {
    expect(FOLKLORE_VIEW_LABEL).toBe("Narratives");
    expect(NARRATIVE_SUBTYPE).toBe("Narrative");
    expect(VARIANT_SUBTYPE).toBe("Variant");
  });

  it("text constants read as FR-8, FR-10 and FR-18 state", () => {
    expect(NOT_SET).toBe("not set");
    expect(NOT_IN_LIST).toBe("not in the list");
    expect(COMPARISON_PHONE_MESSAGE).toBe(
      "Side-by-side comparison needs a wider screen. You can still open each variant from the list.",
    );
  });

  it("phone message promises no rotation, Android or phone support", () => {
    expect(COMPARISON_PHONE_MESSAGE).not.toMatch(/rotat|android|supported/i);
  });
});

describe("folklore-types result types", () => {
  it("VariantTextResult distinguishes the four outcomes", () => {
    const results: VariantTextResult[] = [
      { kind: "text", text: "Once" },
      { kind: "none" },
      { kind: "unreadable", reason: "bad document" },
      { kind: "locked" },
    ];
    expect(new Set(results.map((r) => r.kind)).size).toBe(4);
  });

  it("FolkloreSelection holds a narrative id and variant ids", () => {
    const selection: FolkloreSelection = { narrativeId: null, variantIds: [] };
    expect(selection.variantIds).toEqual([]);
  });
});
