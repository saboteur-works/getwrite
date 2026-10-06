import { describe, it, expect } from "vitest";
import { BUNDLED_NOISE_WORDS } from "../../src/lib/models/bundled-noise-words";

describe("BUNDLED_NOISE_WORDS", () => {
  it("is an array", () => {
    expect(Array.isArray(BUNDLED_NOISE_WORDS)).toBe(true);
  });

  it("has roughly 2000-3000 entries", () => {
    expect(BUNDLED_NOISE_WORDS.length).toBeGreaterThanOrEqual(2000);
    expect(BUNDLED_NOISE_WORDS.length).toBeLessThanOrEqual(3000);
  });

  it("contains only lowercase entries", () => {
    for (const word of BUNDLED_NOISE_WORDS) {
      expect(word).toBe(word.toLowerCase());
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(BUNDLED_NOISE_WORDS).size).toBe(BUNDLED_NOISE_WORDS.length);
  });
});
