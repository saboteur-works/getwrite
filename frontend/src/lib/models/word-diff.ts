/**
 * Word-bag (multiset) difference between two plain-text strings (FR-11).
 *
 * Tokenization mirrors `countWords` (whitespace-split, tokens without a word
 * character dropped) so totals agree with sidecar `wordCount`. Callers pass
 * `tiptapToPlainText(doc)` output. Pure: no I/O.
 *
 * Known blind spots: a moved paragraph yields 0/0, and a rewrite that reuses
 * common words undercounts against a naive replacement count.
 */

export interface WordDiff {
  added: number;
  deleted: number;
  /** Always `added - deleted`. */
  net: number;
}

function tokenize(text: string): string[] {
  if (!text || !text.trim()) return [];
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => /\w/.test(t));
}

function bag(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Number of tokens in `a` not matched (by multiplicity) in `b`. */
function unmatched(a: Map<string, number>, b: Map<string, number>): number {
  let n = 0;
  for (const [tok, count] of a) n += Math.max(0, count - (b.get(tok) ?? 0));
  return n;
}

export function diffWords(before: string, after: string): WordDiff {
  const b = bag(tokenize(before));
  const a = bag(tokenize(after));
  const added = unmatched(a, b);
  const deleted = unmatched(b, a);
  return { added, deleted, net: added - deleted };
}
