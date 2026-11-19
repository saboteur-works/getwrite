/**
 * Feature 121, Task 14: the fixed maximum number of documents of one merge
 * (FR-15, OQ-5) and the pure check against it.
 */
import { describe, expect, it } from "vitest";
import {
  MERGE_DOCUMENT_CAP,
  isMergeDocumentCountWithinCap,
} from "../../src/lib/models/merge-limits";

describe("merge-limits", () => {
  it("fixes the cap at 25 (owner decision, Task 14)", () => {
    expect(MERGE_DOCUMENT_CAP).toBe(25);
  });

  it("accepts a count at the cap", () => {
    expect(isMergeDocumentCountWithinCap(25)).toBe(true);
  });

  it("refuses a count one over the cap", () => {
    expect(isMergeDocumentCountWithinCap(26)).toBe(false);
  });

  it("refuses a count below two", () => {
    expect(isMergeDocumentCountWithinCap(1)).toBe(false);
    expect(isMergeDocumentCountWithinCap(0)).toBe(false);
  });

  it("accepts the smallest merge and a value in between", () => {
    expect(isMergeDocumentCountWithinCap(2)).toBe(true);
    expect(isMergeDocumentCountWithinCap(10)).toBe(true);
  });

  it("refuses a non-integer, negative or non-finite count", () => {
    expect(isMergeDocumentCountWithinCap(2.5)).toBe(false);
    expect(isMergeDocumentCountWithinCap(-3)).toBe(false);
    expect(isMergeDocumentCountWithinCap(Number.NaN)).toBe(false);
    expect(isMergeDocumentCountWithinCap(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
