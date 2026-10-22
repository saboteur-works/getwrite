/**
 * @module dialogue-spans
 *
 * Finds quoted speech in plain text. A leaf module with no imports, so the
 * editor's dialogue highlight (browser code) can use it: `prose-diagnostics.ts`
 * imports `inverted-index.ts`, which reaches `node:fs` through `io.ts` and
 * cannot be bundled for the client. `prose-diagnostics.ts` re-exports these
 * and builds `dialogueRatio` on {@link dialogueSpans}.
 */

/** Double-quoted speech: straight or curly double quotes, across lines. */
const QUOTED_SPAN_REGEX = /["“][^"”]*["”]/g;

/** Which quote marks delimit dialogue for {@link dialogueSpans}. */
export type DialogueQuoteStyle = "double" | "single";

/** A run of `text`, from `start` (inclusive) to `end` (exclusive). */
export interface TextSpan {
  start: number;
  end: number;
}

/**
 * Single-quoted speech: an opening `'` or `‘` not preceded by a letter or
 * digit and followed by a non-space, closed by a `'` or `’` preceded by a
 * non-space and not followed by a letter or digit, within one line. The
 * letter/digit checks keep contractions and most possessives (`don’t`,
 * `it's`, `the dogs’ bowl` outside speech) from opening or closing a quote.
 * Known limit: a plural possessive inside speech (`‘the dogs’ bowl’`) ends
 * the span early.
 */
const SINGLE_QUOTED_SPAN_REGEX =
  /(?<![\p{L}\p{N}])['‘](?=[^\s'’])[^\n]*?(?<=[^\s'‘])['’](?![\p{L}\p{N}])/gu;

/**
 * The quoted-speech spans in `text`, quote marks included. `"double"` uses
 * the same rule as {@link dialogueRatio} (straight or curly double quotes,
 * which may run across lines), so its spans cover exactly the characters
 * the ratio counts. `"single"` uses {@link SINGLE_QUOTED_SPAN_REGEX}. Used
 * by the editor's dialogue highlight.
 */
export function dialogueSpans(
  text: string,
  style: DialogueQuoteStyle,
): TextSpan[] {
  const regex = new RegExp(
    style === "double" ? QUOTED_SPAN_REGEX : SINGLE_QUOTED_SPAN_REGEX,
  );
  const spans: TextSpan[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}
