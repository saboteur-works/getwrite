/**
 * @module prose-diagnostics
 *
 * Feature 62 (prose-diagnostics), Task 2: real, pure implementations of
 * FR-49's three scalar prose-diagnostic metrics — dialogue ratio, average
 * sentence length, and top repeated words.
 *
 * DELIBERATE OVERRIDE NOTICE: `dialogueRatio` and `averageSentenceLength`
 * below port the exact regex/quote-detection approach used by the throwaway
 * stand-ins in `frontend/tests/proseDiagnosticsBenchmark.test.ts`
 * (`dialogueRatioStandin` / `averageSentenceLengthStandin`). That benchmark
 * file's own docblock warns "Do not reuse these functions as production
 * code" — that warning was correct when written, describing a benchmark
 * whose algorithms had not yet been product-approved. It is being knowingly
 * superseded here, not silently ignored: Feature 63 (prose-diagnostics
 * benchmark) measured this specific approach's wall-clock cost at 1k/10k/
 * 100k words and found it acceptable (see `specs/product/getwrite.features.md`
 * Feature 63 and the benchmark test file itself), and Gate 3 for Feature 62
 * explicitly directs adopting the same regex approach as-is, including its
 * known "Mr." false-split limitation on `averageSentenceLength` — that
 * limitation is ported deliberately, not fixed, per that direction. A future
 * reader should treat this file's use of the same regexes as an intentional,
 * later, explicit product decision rather than a violation of the benchmark
 * file's warning.
 *
 * `topRepeatedWords` diverges from its benchmark stand-in
 * (`topRepeatedWordsStandin`) in one respect: instead of the stand-in's ad
 * hoc `text.toLowerCase().match(/[a-z']+/g)` tokenization, it reuses
 * `inverted-index.ts`'s exported `tokenize()` so word filtering matches the
 * rest of the app's search/indexing behavior. `tokenize()` already excludes
 * every word in that module's `STOP_WORDS` set internally (that set itself
 * is not exported, and is not needed here as a separate import since
 * `tokenize()`'s own filtering already applies it).
 */
import { tokenize } from "./inverted-index";

/** Version tag for the heuristics implemented in this module. Bump when an
 * algorithm here changes in a way that could alter a previously-computed
 * diagnostic's meaning, so a later feature can detect and recompute stale
 * results. */
export const HEURISTIC_VERSION = 1;

const QUOTED_SPAN_REGEX = /["“][^"”]*["”]/g;

/**
 * The fraction of `text`'s characters that fall inside a quoted-speech span.
 * A quoted span is any run bounded by a straight or curly double quote on
 * each side (`"..."` or `“...”`); the ratio counts every character
 * of each such span, including its two quote marks, divided by the
 * document's total character count. Returns 0 for an empty string (no
 * division by zero) and 0 for text with no quotes.
 */
export function dialogueRatio(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const regex = new RegExp(QUOTED_SPAN_REGEX);
  let quotedChars = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    quotedChars += match[0].length;
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }
  return quotedChars / text.length;
}

/**
 * The average whitespace-delimited word count across `text`'s sentences,
 * where a sentence boundary is one or more of `.`, `!`, `?` followed by
 * whitespace (`/[.!?]+\s+/`). Known limitation, ported deliberately and not
 * fixed: an abbreviation like "Mr." is treated as a sentence boundary,
 * falsely splitting the sentence it belongs to. Returns 0 when `text`
 * contains no non-empty sentences.
 */
export function averageSentenceLength(text: string): number {
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

export interface WordFrequency {
  word: string;
  count: number;
}

export interface TopRepeatedWordsOptions {
  /** Maximum number of words to return. Defaults to 10. */
  n?: number;
  /** Minimum occurrence count a word must reach to be included. Defaults to 3. */
  minOccurrences?: number;
}

const DEFAULT_TOP_N = 10;
const DEFAULT_MIN_OCCURRENCES = 3;

/**
 * The top `n` most frequently occurring words in `text`, excluding every
 * `STOP_WORDS` member regardless of frequency and excluding any word whose
 * count falls below `minOccurrences`. Ties are broken by first-encountered
 * order (via `Array.prototype.sort`'s stable sort). Tokenization and stop-word
 * filtering reuse `inverted-index.ts`'s `tokenize()`/`STOP_WORDS`.
 */
export function topRepeatedWords(
  text: string,
  opts: TopRepeatedWordsOptions = {},
): WordFrequency[] {
  const n = opts.n ?? DEFAULT_TOP_N;
  const minOccurrences = opts.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;

  const counts = new Map<string, number>();
  for (const word of tokenize(text)) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= minOccurrences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}
