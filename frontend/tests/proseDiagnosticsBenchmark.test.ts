/**
 * @module proseDiagnosticsBenchmark.test
 *
 * Feature 63 (prose-diagnostics-benchmark), Task 2: a standalone, timed
 * benchmark harness measuring the wall-clock cost of FR-49's three scalar
 * prose-diagnostic metrics — dialogue ratio, average sentence length, top
 * repeated words — at 1k/10k/100k words, independently and combined. This
 * test produces the raw numbers Task 3 records onto FR-49/Feature 62 in
 * `specs/product/getwrite.md` and `specs/product/getwrite.features.md` — it
 * does not assert a millisecond threshold itself (per FR-6, no threshold is
 * appropriate here: no existing indexer timing budget exists to compare
 * against, and inventing one would present a judgment as a measurement); it
 * only asserts the harness is internally consistent (finite, non-negative
 * timings; combined cost never cheaper than its slowest constituent; each
 * metric finds a non-trivial result on the dialogue-bearing fixture) and logs
 * the measured numbers so a run's output is reproducible, copy-pasteable
 * evidence.
 *
 * IMPORTANT: `dialogueRatioStandin`, `averageSentenceLengthStandin`, and
 * `topRepeatedWordsStandin` below are throwaway cost stand-ins built ONLY to
 * have something realistic to time for THIS benchmark. They are deliberately
 * simple (a quote-pair character scan, a naive sentence-boundary split, a
 * lowercase word-frequency count) and are NOT Feature 62's eventual
 * implementations of dialogue ratio / average sentence length / top repeated
 * words — Feature 62's design, including its actual algorithms, is gated on
 * this benchmark's finding and is out of scope here. Do not reuse these
 * functions as production code.
 *
 * Fixtures: `frontend/tests/fixtures/prose-diagnostics-benchmark/{1k,10k,100k}-words.txt`
 * (Task 1; see that directory's `LICENSE-NOTE.md` for provenance — a public-
 * domain prose excerpt containing real quoted-speech dialogue, using curly
 * `“`/`”` quote characters, which is why the dialogue-ratio stand-in below
 * matches curly quotes as well as straight ones). Word-count definition
 * reused unchanged from `fixture-word-counts.test.ts`:
 * `text.trim().split(/\s+/).filter(Boolean).length`.
 *
 * Repeat count: each (metric x size) and (combined x size) cell is measured
 * as the MEDIAN of 7 timed runs, not a single sample — a single
 * `performance.now()` measurement is vulnerable to one GC pause or scheduler
 * hiccup dominating the number, exactly as `entityHighlightBenchmark.test.ts`
 * notes for its own corpus matrix. 7 is odd (a clean median with no
 * averaging-of-two-middle-values ambiguity), small enough to keep this suite
 * fast (63 metric-cell runs + 9 combined-cell runs total, well under a
 * second), and large enough that a single outlier run does not decide the
 * reported number. This repeat count was not adjusted from 7 — a local run
 * (see Task 2's report) showed stable, consistently-ordered medians across
 * repeated invocations, so no adjustment was needed.
 *
 * Run: `pnpm --filter getwrite-frontend exec vitest run proseDiagnosticsBenchmark --reporter=verbose`
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURES_DIR = join(__dirname, "fixtures", "prose-diagnostics-benchmark");

// ---------------------------------------------------------------------------
// Throwaway metric stand-ins — see module docblock. NOT product code.
// ---------------------------------------------------------------------------

/**
 * Throwaway stand-in for a "dialogue ratio" metric: the fraction of the
 * document's characters that fall inside a quoted-speech span. A quoted span
 * is any run bounded by a straight or curly double quote on each side
 * (`"..."` or `“...”`); the ratio counts every character of each such span,
 * including its two quote marks, divided by the document's total character
 * count. Pure function — no filesystem or product-module access.
 */
function dialogueRatioStandin(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const quotedSpanRegex = /["“][^"”]*["”]/g;
  let quotedChars = 0;
  let match: RegExpExecArray | null;
  while ((match = quotedSpanRegex.exec(text)) !== null) {
    quotedChars += match[0].length;
    if (match[0].length === 0) {
      quotedSpanRegex.lastIndex += 1;
    }
  }
  return quotedChars / text.length;
}

/**
 * Throwaway stand-in for an "average sentence length" metric: splits the
 * document on simple sentence-boundary punctuation (one or more of `.`, `!`,
 * `?` followed by whitespace) and returns the average whitespace-delimited
 * word count across the resulting sentences. Pure function.
 */
function averageSentenceLengthStandin(text: string): number {
  const sentences = text
    .split(/[.!?]+\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  if (sentences.length === 0) {
    return 0;
  }
  const totalWords = sentences.reduce(
    (sum, sentence) => sum + sentence.split(/\s+/).filter(Boolean).length,
    0,
  );
  return totalWords / sentences.length;
}

interface WordFrequency {
  word: string;
  count: number;
}

/**
 * Throwaway stand-in for a "top repeated words" metric: a simple lowercase
 * word-frequency count over the document, returning the top `n` words by
 * count (ties broken by first-encountered order, via `Array.sort`'s stable
 * sort). Pure function.
 */
function topRepeatedWordsStandin(text: string, n: number): WordFrequency[] {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

// ---------------------------------------------------------------------------
// Timed harness
// ---------------------------------------------------------------------------

const REPEATS = 7;

/** Odd-length median of a set of timing samples (no averaging-of-two-middle
 * -values ambiguity since REPEATS is always odd). */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function timeOnce(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

/** Runs `fn` REPEATS times, timing each run individually, and returns the
 * median elapsed time in milliseconds. */
function measureMedianMs(fn: () => void, repeats: number = REPEATS): number {
  const timings: number[] = [];
  for (let i = 0; i < repeats; i += 1) {
    timings.push(timeOnce(fn));
  }
  return median(timings);
}

const FIXTURE_SIZES = [
  { label: "1k", filename: "1k-words.txt" },
  { label: "10k", filename: "10k-words.txt" },
  { label: "100k", filename: "100k-words.txt" },
] as const;

interface SizeResult {
  label: string;
  wordCount: number;
  dialogueRatioMs: number;
  avgSentenceLengthMs: number;
  topRepeatedWordsMs: number;
  combinedMs: number;
  // Metric outputs from a single representative run, used only for the
  // internal-consistency assertions below (not part of the timed harness).
  dialogueRatioValue: number;
  sentenceCount: number;
  topRepeatedWordsCount: number;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function runBenchmarkForSize(label: string, filename: string): SizeResult {
  const text = readFileSync(join(FIXTURES_DIR, filename), "utf8");

  const dialogueRatioMs = measureMedianMs(() => {
    dialogueRatioStandin(text);
  });
  const avgSentenceLengthMs = measureMedianMs(() => {
    averageSentenceLengthStandin(text);
  });
  const topRepeatedWordsMs = measureMedianMs(() => {
    topRepeatedWordsStandin(text, 10);
  });

  // Combined cost: all three metrics run back-to-back inside one timed call,
  // per FR-2 — measured directly, never derived by summing the individual
  // medians above (those are separate measurements of separate call
  // patterns; summing them would not account for e.g. shared engine
  // warm-up/JIT effects across the three calls run together).
  const combinedMs = measureMedianMs(() => {
    dialogueRatioStandin(text);
    averageSentenceLengthStandin(text);
    topRepeatedWordsStandin(text, 10);
  });

  // Representative single-run outputs for the consistency assertions only.
  const dialogueRatioValue = dialogueRatioStandin(text);
  const sentenceCount = text
    .split(/[.!?]+\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
  const topRepeatedWordsCount = topRepeatedWordsStandin(text, 10).length;

  return {
    label,
    wordCount: countWords(text),
    dialogueRatioMs,
    avgSentenceLengthMs,
    topRepeatedWordsMs,
    combinedMs,
    dialogueRatioValue,
    sentenceCount,
    topRepeatedWordsCount,
  };
}

describe("prose diagnostics cost benchmark", () => {
  it("measures per-metric and combined cost at 1k/10k/100k words, 7-run median each", () => {
    const results = FIXTURE_SIZES.map(({ label, filename }) =>
      runBenchmarkForSize(label, filename),
    );

    console.log(
      "\nProse diagnostics benchmark results (median of 7 runs, elapsed ms; see specs/product/getwrite.features.md Feature 63)\n" +
        [
          "size".padEnd(6),
          "words".padEnd(8),
          "dialogueRatioMs".padEnd(16),
          "avgSentenceLenMs".padEnd(17),
          "topRepeatedMs".padEnd(14),
          "combinedMs",
        ].join(" | "),
    );
    for (const r of results) {
      console.log(
        [
          r.label.padEnd(6),
          String(r.wordCount).padEnd(8),
          r.dialogueRatioMs.toFixed(3).padEnd(16),
          r.avgSentenceLengthMs.toFixed(3).padEnd(17),
          r.topRepeatedWordsMs.toFixed(3).padEnd(14),
          r.combinedMs.toFixed(3),
        ].join(" | "),
      );
    }

    expect(results).toHaveLength(3);
    for (const r of results) {
      // Every reported timing is a real, finite, non-negative measurement.
      for (const ms of [
        r.dialogueRatioMs,
        r.avgSentenceLengthMs,
        r.topRepeatedWordsMs,
        r.combinedMs,
      ]) {
        expect(Number.isFinite(ms)).toBe(true);
        expect(ms).toBeGreaterThanOrEqual(0);
      }

      // Running all three back-to-back cannot be cheaper than the slowest
      // one alone — small timer-noise slack for granularity.
      const slowestIndividualMs = Math.max(
        r.dialogueRatioMs,
        r.avgSentenceLengthMs,
        r.topRepeatedWordsMs,
      );
      expect(r.combinedMs).toBeGreaterThanOrEqual(slowestIndividualMs - 1);

      // Each metric produces a non-trivial result on this dialogue-bearing
      // fixture — a zero/empty result everywhere would mean the harness
      // itself is broken, not that the fixture lacks dialogue/sentences/
      // repeated words (Task 1's LICENSE-NOTE.md confirms all three fixtures
      // contain real quoted-speech dialogue).
      expect(r.dialogueRatioValue).toBeGreaterThan(0);
      expect(r.sentenceCount).toBeGreaterThan(0);
      expect(r.topRepeatedWordsCount).toBeGreaterThan(0);
    }
  });
});
