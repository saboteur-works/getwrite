import { describe, it, expect } from "vitest";
import { checkNoiseFlag } from "../../src/lib/models/entity-noise-check";

describe("checkNoiseFlag", () => {
  it("warns on a term under three characters", () => {
    expect(checkNoiseFlag("Al")).toBe(true);
  });

  it("warns case-insensitively on a bundled-list match", () => {
    expect(checkNoiseFlag("May")).toBe(true);
    expect(checkNoiseFlag("may")).toBe(true);
    expect(checkNoiseFlag("MAY")).toBe(true);
  });

  it("does not warn on an ordinary term with no list match", () => {
    expect(checkNoiseFlag("Duchess")).toBe(false);
  });

  it("flags a term matching the project's custom noise-word list (FR-7)", () => {
    expect(checkNoiseFlag("Gizmo")).toBe(false);
    expect(
      checkNoiseFlag("Gizmo", { projectCustomNoiseWords: ["gizmo"] }),
    ).toBe(true);
  });

  it("flags a term matching the resolved global noise-word list (FR-7)", () => {
    expect(checkNoiseFlag("Sprocket")).toBe(false);
    expect(checkNoiseFlag("Sprocket", { globalNoiseWords: ["sprocket"] })).toBe(
      true,
    );
  });

  it("suppresses a global-list match the project has excluded (FR-7/FR-6)", () => {
    expect(
      checkNoiseFlag("Widget", {
        globalNoiseWords: ["widget"],
        projectExcludedGlobalNoiseWords: ["widget"],
      }),
    ).toBe(false);
  });

  it("the exclusion subtracts from the whole union, per FR-7's literal formula", () => {
    // FR-7's formula is `bundled ∪ projectCustom ∪ global MINUS
    // projectExcludedGlobalWords`, applied to the union as a whole, not just
    // to whichever source(s) contributed the word — so excluding a term
    // that also happens to be in the bundled list still suppresses it.
    // "may" is bundled-list noise-prone by default:
    expect(checkNoiseFlag("May")).toBe(true);
    expect(
      checkNoiseFlag("May", { projectExcludedGlobalNoiseWords: ["may"] }),
    ).toBe(false);
  });

  it("suppresses a repeat observation for a dismissed term (FR-8/FR-13)", () => {
    expect(checkNoiseFlag("Case")).toBe(true);
    expect(checkNoiseFlag("Case", { dismissedNoiseTerms: ["case"] })).toBe(
      false,
    );
  });

  it("does not carry a dismissal over once the term text changes (FR-13)", () => {
    const sources = {
      projectCustomNoiseWords: ["case2"],
      dismissedNoiseTerms: ["case"],
    };
    // "Case" was dismissed and stays suppressed under the identical
    // normalized text.
    expect(checkNoiseFlag("Case", sources)).toBe(false);
    // "Case2" is a different normalized string, not in the dismissed set —
    // it resurfaces, flagged here via the project's own custom list.
    expect(checkNoiseFlag("Case2", sources)).toBe(true);
  });

  it("never throws or mutates its input regardless of term content", () => {
    const inputs = [
      "",
      "   ",
      "a".repeat(10_000),
      "!@#$%^&*()_+-=[]{}|;':\",./<>?",
      "\n\t\r",
      "Ariá-Véla",
    ];

    for (const input of inputs) {
      const original = input;
      expect(() => checkNoiseFlag(input)).not.toThrow();
      expect(input).toBe(original);
    }
  });

  it("never mutates the sources object or its arrays", () => {
    const sources = {
      projectCustomNoiseWords: ["gizmo"],
      projectExcludedGlobalNoiseWords: ["widget"],
      globalNoiseWords: ["sprocket"],
      dismissedNoiseTerms: ["case"],
    };
    const snapshot = JSON.parse(JSON.stringify(sources));
    checkNoiseFlag("Gizmo", sources);
    expect(sources).toEqual(snapshot);
  });
});
