import { describe, it, expect } from "vitest";
import { computeProximityScore } from "../../src/lib/models/search-scoring";

describe("computeProximityScore", () => {
  it("returns 0 for a single-term input", () => {
    expect(computeProximityScore("hello world", ["hello"])).toBe(0);
  });

  it("returns 0 for an empty term list", () => {
    expect(computeProximityScore("hello world", [])).toBe(0);
  });

  it("returns 0 when not all terms are present in the text", () => {
    expect(computeProximityScore("only tall here", ["tall", "one"])).toBe(0);
  });

  it("returns 0 when one term is missing entirely", () => {
    expect(
      computeProximityScore("dragon flies high", ["dragon", "knight"]),
    ).toBe(0);
  });

  it("scores adjacent terms higher than distant terms", () => {
    const nearScore = computeProximityScore("the tall one", ["tall", "one"]);
    const farScore = computeProximityScore(
      "tall " + "word ".repeat(50) + "one",
      ["tall", "one"],
    );
    expect(nearScore).toBeGreaterThan(farScore);
  });

  it("finds the minimum window across multiple occurrences", () => {
    // "tall" appears far from "one" early on, then adjacent at the end
    const textWithClose = "tall word word word one tall one";
    const textOnlyClose = "tall one";

    const scoreWithClose = computeProximityScore(textWithClose, [
      "tall",
      "one",
    ]);
    const scoreOnlyClose = computeProximityScore(textOnlyClose, [
      "tall",
      "one",
    ]);

    // Both should find the adjacent pair; scores should be identical
    expect(scoreWithClose).toBeCloseTo(scoreOnlyClose, 1);
  });

  it("is case-insensitive", () => {
    const lower = computeProximityScore("the tall one", ["tall", "one"]);
    const mixed = computeProximityScore("The Tall One", ["tall", "one"]);
    expect(lower).toBe(mixed);
  });

  it("handles three-term queries", () => {
    const tight = computeProximityScore("dragon knight queen battle", [
      "dragon",
      "knight",
      "queen",
    ]);
    const loose = computeProximityScore(
      "dragon " + "word ".repeat(30) + "knight " + "word ".repeat(30) + "queen",
      ["dragon", "knight", "queen"],
    );
    expect(tight).toBeGreaterThan(loose);
  });

  it("returns a value in (0, 1000] when all terms are present", () => {
    const score = computeProximityScore("tall one nearby", ["tall", "one"]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1000);
  });
});
