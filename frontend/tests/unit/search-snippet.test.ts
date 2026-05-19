import { describe, it, expect } from "vitest";
import { extractSnippet } from "../../src/lib/models/search-snippet";

describe("extractSnippet", () => {
    it("returns empty string when text is empty", () => {
        expect(extractSnippet("", "hello", 160)).toBe("");
    });

    it("returns empty string when query is empty", () => {
        expect(extractSnippet("some text here", "", 160)).toBe("");
    });

    it("returns empty string when no query term matches", () => {
        expect(extractSnippet("the quick brown fox", "elephant", 160)).toBe("");
    });

    it("returns the full text when text is shorter than maxLen and there is a match", () => {
        const text = "hello world";
        expect(extractSnippet(text, "hello", 160)).toBe(text);
    });

    it("centers the window on a match in the middle of a long text", () => {
        const before = "a".repeat(100);
        const after = "b".repeat(100);
        const text = `${before}TARGET${after}`;
        const result = extractSnippet(text, "target", 20);
        expect(result.toLowerCase()).toContain("target");
        expect(result.length).toBeLessThanOrEqual(20);
        // match should be roughly in the middle of the snippet
        const idx = result.toLowerCase().indexOf("target");
        expect(idx).toBeGreaterThan(0);
        expect(idx).toBeLessThan(result.length - 6);
    });

    it("handles a match at the start of the text without going out of bounds", () => {
        const text = "hello" + " world".repeat(40);
        const result = extractSnippet(text, "hello", 30);
        expect(result.startsWith("hello")).toBe(true);
        expect(result.length).toBeLessThanOrEqual(30);
    });

    it("handles a match at the end of the text without going out of bounds", () => {
        const text = "word ".repeat(40) + "target";
        const result = extractSnippet(text, "target", 30);
        expect(result.endsWith("target")).toBe(true);
        expect(result.length).toBeLessThanOrEqual(30);
    });

    it("never exceeds maxLen characters", () => {
        const text = "x".repeat(500) + "needle" + "y".repeat(500);
        for (const maxLen of [10, 20, 50, 160]) {
            const result = extractSnippet(text, "needle", maxLen);
            expect(result.length).toBeLessThanOrEqual(maxLen);
        }
    });

    it("matches the first occurring term in a multi-word query", () => {
        const text = "the quick brown fox jumps over the lazy dog";
        // "fox" appears before "lazy"
        const result = extractSnippet(text, "lazy fox", 20);
        expect(result).toContain("fox");
    });

    it("matches any term in a multi-word query", () => {
        const text = "the quick brown fox";
        const result = extractSnippet(text, "missing fox", 160);
        expect(result).toContain("fox");
    });

    it("is case-insensitive", () => {
        const text = "The Quick Brown Fox";
        const result = extractSnippet(text, "quick", 160);
        expect(result).toContain("Quick");
    });

    it("uses 160 as the default maxLen", () => {
        const text = "z".repeat(400) + "needle" + "z".repeat(400);
        const result = extractSnippet(text, "needle");
        expect(result.length).toBeLessThanOrEqual(160);
        expect(result).toContain("needle");
    });
});
