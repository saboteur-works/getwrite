/**
 * @module fixture-word-counts.test
 *
 * Feature 63 (prose-diagnostics-benchmark), Task 1: a small standalone check
 * — not part of the timed benchmark itself (that is Task 2's
 * `proseDiagnosticsBenchmark.test.ts`) — that programmatically verifies the
 * three vendored prose fixtures in this directory are each exactly the word
 * count their filename claims. "Programmatically" per FR-3/OQ-1: the counts
 * below are computed by this test at run time from the files on disk, not
 * asserted from a number someone eyeballed once.
 *
 * Word count definition (stated once here so Task 2's benchmark harness can
 * reuse the identical definition rather than defining its own):
 *
 *   text.trim().split(/\s+/).filter(Boolean).length
 *
 * See `LICENSE-NOTE.md` in this directory for the fixtures' source, its
 * public-domain basis, and the exact cleaning/cut boundaries.
 *
 * Run: `pnpm --filter getwrite-frontend exec vitest run fixture-word-counts`
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURES_DIR = __dirname;

/** The exact word-count definition every fixture in this directory, and the
 * Task 2 benchmark harness, must agree on. */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe("prose diagnostics benchmark fixtures — word counts", () => {
  it("1k-words.txt is exactly 1,000 words", () => {
    const text = readFileSync(join(FIXTURES_DIR, "1k-words.txt"), "utf8");
    expect(countWords(text)).toBe(1000);
  });

  it("10k-words.txt is exactly 10,000 words", () => {
    const text = readFileSync(join(FIXTURES_DIR, "10k-words.txt"), "utf8");
    expect(countWords(text)).toBe(10000);
  });

  it("100k-words.txt is exactly 100,000 words", () => {
    const text = readFileSync(join(FIXTURES_DIR, "100k-words.txt"), "utf8");
    expect(countWords(text)).toBe(100000);
  });

  it("10k-words.txt is a strict superset (prefix) of 1k-words.txt", () => {
    const oneK = readFileSync(
      join(FIXTURES_DIR, "1k-words.txt"),
      "utf8",
    ).trimEnd();
    const tenK = readFileSync(
      join(FIXTURES_DIR, "10k-words.txt"),
      "utf8",
    ).trimEnd();
    expect(tenK.startsWith(oneK)).toBe(true);
  });

  it("100k-words.txt is a strict superset (prefix) of 10k-words.txt", () => {
    const tenK = readFileSync(
      join(FIXTURES_DIR, "10k-words.txt"),
      "utf8",
    ).trimEnd();
    const hundredK = readFileSync(
      join(FIXTURES_DIR, "100k-words.txt"),
      "utf8",
    ).trimEnd();
    expect(hundredK.startsWith(tenK)).toBe(true);
  });

  it("each fixture contains real quoted-speech dialogue", () => {
    for (const filename of [
      "1k-words.txt",
      "10k-words.txt",
      "100k-words.txt",
    ]) {
      const text = readFileSync(join(FIXTURES_DIR, filename), "utf8");
      // Matches a straight or curly double-quote pair enclosing at least a
      // few characters of dialogue, e.g. “My dear Mr. Bennet,”.
      const hasDialogue = /[“"][^“”"\n]{3,}[”"]/.test(text);
      expect(hasDialogue).toBe(true);
    }
  });
});
