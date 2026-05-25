import { describe, it, expect } from "vitest";
import { countWords } from "../../src/lib/word-count";

describe("countWords", () => {
  it("returns 0 for empty string", () => expect(countWords("")).toBe(0));
  it("returns 0 for whitespace-only", () => expect(countWords("   ")).toBe(0));
  it("counts simple words", () => expect(countWords("Hello world")).toBe(2));
  it("handles multiple spaces", () => expect(countWords("  a   b  ")).toBe(2));
  it("counts sentence with punctuation attached", () =>
    expect(countWords("Add more content here, please.")).toBe(5));
  it("ignores punctuation-only tokens", () =>
    expect(countWords("...")).toBe(0));
  it("handles newlines as word separators", () =>
    expect(countWords("one\ntwo\nthree")).toBe(3));
  it("counts contractions as one word", () =>
    expect(countWords("don't stop")).toBe(2));
  it("counts comma-separated words correctly", () =>
    expect(countWords("Hello, world!")).toBe(2));
});
