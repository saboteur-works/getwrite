/**
 * @module word-at-position
 *
 * The word under a document position, for selecting the word a touch
 * long-press lands on (task_0162a56f) so the context menu's Cut and Copy act
 * on it. Unlike the spell checker's word rule (`lib/spelling/extract-words.ts`),
 * every run of letters, marks, digits or underscores counts, including a
 * one-letter word, a number and code-marked text. An apostrophe or hyphen
 * between two word characters is inside the word. A non-text inline node
 * (a hard break, an image) ends the word.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** A word's document range. */
export interface WordRange {
  from: number;
  to: number;
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}_]/u;
const JOINER = /['’-]/u;

/** One character of a textblock and its document position. */
interface BlockChar {
  char: string;
  pos: number;
}

/** The textblock's characters; a non-text inline node is `null`. */
function blockChars(
  block: ProseMirrorNode,
  blockStart: number,
): (BlockChar | null)[] {
  const chars: (BlockChar | null)[] = [];
  block.forEach((child, offset) => {
    const childPos = blockStart + offset;
    if (child.isText && child.text) {
      for (let i = 0; i < child.text.length; i++) {
        chars.push({ char: child.text[i], pos: childPos + i });
      }
      return;
    }
    chars.push(null);
  });
  return chars;
}

function isWordAt(chars: (BlockChar | null)[], i: number): boolean {
  const c = chars[i];
  if (!c) return false;
  if (WORD_CHAR.test(c.char)) return true;
  // A joiner counts only between two word characters ("don't", "well-known").
  return (
    JOINER.test(c.char) &&
    WORD_CHAR.test(chars[i - 1]?.char ?? "") &&
    WORD_CHAR.test(chars[i + 1]?.char ?? "")
  );
}

/**
 * The word containing `pos`, where a position at either edge of a word is in
 * it; `null` when neither neighbouring character is part of a word, or `pos`
 * is not inside inline content.
 */
export function findWordRangeAt(
  doc: ProseMirrorNode,
  pos: number,
): WordRange | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  if (!$pos.parent.inlineContent) return null;
  const chars = blockChars($pos.parent, $pos.start());
  // The character just after `pos`, and just before it.
  const after = chars.findIndex((c) => c !== null && c.pos >= pos);
  const candidates = [after === -1 ? chars.length : after];
  candidates.push(candidates[0] - 1);
  const hit = candidates.find(
    (i) => i >= 0 && i < chars.length && isWordAt(chars, i),
  );
  if (hit === undefined) return null;
  let start = hit;
  while (start > 0 && isWordAt(chars, start - 1)) start--;
  let end = hit;
  while (end < chars.length - 1 && isWordAt(chars, end + 1)) end++;
  const first = chars[start] as BlockChar;
  const last = chars[end] as BlockChar;
  return { from: first.pos, to: last.pos + 1 };
}
