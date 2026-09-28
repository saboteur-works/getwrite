/**
 * @module prose-diagnostics.test
 *
 * Feature 62 (prose-diagnostics), Task 2: unit tests for the real
 * dialogue-ratio, average-sentence-length, and top-repeated-words scalar
 * metric functions in `src/lib/models/prose-diagnostics.ts`. Fixtures here
 * are short synthetic strings — the 1k/10k/100k benchmark fixtures used by
 * `proseDiagnosticsBenchmark.test.ts` are not required for correctness
 * testing.
 */
import { describe, expect, it } from "vitest";
import {
  HEURISTIC_VERSION,
  averageSentenceLength,
  dialogueRatio,
  topRepeatedWords,
} from "../../src/lib/models/prose-diagnostics";

describe("dialogueRatio", () => {
  it("returns 0 for an empty string without dividing by zero", () => {
    expect(dialogueRatio("")).toBe(0);
  });

  it("returns 0 for text with no quotes", () => {
    expect(dialogueRatio("The rain fell on the quiet street.")).toBe(0);
  });

  it("computes the fraction of characters inside a straight-quoted span", () => {
    const text = '"Hi" there'; // quoted span "Hi" = 4 chars, total = 10 chars
    expect(dialogueRatio(text)).toBeCloseTo(4 / 10, 10);
  });

  it("detects a curly-quote dialogue span identically to a straight-quote one", () => {
    const straight = '"Hi" there';
    const curly = "“Hi” there";
    expect(dialogueRatio(curly)).toBeCloseTo(dialogueRatio(straight), 10);
  });
});

describe("averageSentenceLength", () => {
  it("returns 0 for text with no sentences", () => {
    expect(averageSentenceLength("")).toBe(0);
  });

  it("averages whitespace-delimited word counts across split sentences", () => {
    // Two sentences: "One two three" (3 words), "Four five" (2 words).
    const text = "One two three. Four five.";
    expect(averageSentenceLength(text)).toBeCloseTo((3 + 2) / 2, 10);
  });

  it("falsely splits on the 'Mr.' abbreviation (documented known limitation, not fixed)", () => {
    // "Mr. Smith went home." splits on "Mr. " into two pieces: "Mr" and
    // "Smith went home." — 1 word then 3 words, average 2 — because the
    // ported algorithm uses the same naive `/[.!?]+\s+/` split as the
    // benchmark stand-in and does not special-case abbreviations.
    const text = "Mr. Smith went home.";
    expect(averageSentenceLength(text)).toBeCloseTo((1 + 3) / 2, 10);
  });
});

describe("topRepeatedWords", () => {
  it("excludes words occurring only 1-2 times (default minOccurrences=3)", () => {
    const text = "apple apple apple banana banana cherry";
    const result = topRepeatedWords(text);
    expect(result).toEqual([{ word: "apple", count: 3 }]);
  });

  it("excludes every STOP_WORDS member regardless of frequency", () => {
    const text = "the the the the and and and and dog dog dog dog";
    const result = topRepeatedWords(text);
    expect(result).toEqual([{ word: "dog", count: 4 }]);
  });

  it("respects the top-N-of-10 default cutoff", () => {
    const words = Array.from({ length: 12 }, (_, i) => `word${i}`);
    const text = words.map((w) => `${w} ${w} ${w}`).join(" "); // each appears 3x
    const result = topRepeatedWords(text);
    expect(result.length).toBe(10);
  });

  it("respects a custom n and minOccurrences", () => {
    const text = "zebra zebra yak yak yak";
    const result = topRepeatedWords(text, { n: 1, minOccurrences: 2 });
    expect(result).toEqual([{ word: "yak", count: 3 }]);
  });
});

describe("HEURISTIC_VERSION", () => {
  it("starts at 1", () => {
    expect(HEURISTIC_VERSION).toBe(1);
  });
});
