/**
 * @module content-loss
 *
 * Decides whether an in-place canonical-revision write would remove enough of
 * a resource's content to be worth preserving the previous state first.
 *
 * Autosave writes through the canonical revision (`revision-core.ts`'s
 * `updateRevisionInPlace`), so a destructive editor state — an undo overshoot,
 * a select-all-and-type, a paste over a full selection — overwrites both the
 * resource's content files and the one revision that could have restored them.
 * A resource with a single revision then has no undamaged copy anywhere on
 * disk, and the only surviving one is the editor's in-memory undo stack, which
 * a reload discards (note_68cf31b0, measured 2026-09-04 and reproduced
 * 2026-09-23).
 *
 * This module answers only "is this change destructive enough to snapshot?".
 * It reads and writes nothing.
 */
import { tiptapToPlainText } from "../tiptap-utils";
import { countWords } from "../word-count";
import type { TipTapDocument } from "../models";

/**
 * Fraction of the previous word count that must survive for a change to count
 * as ordinary editing. At or below this, the change is treated as destructive.
 *
 * CHOSEN, NOT MEASURED. Half is a judgement about where "heavy editing" ends
 * and "lost the document" begins; no corpus of real editing sessions was
 * analyzed to derive it. It is deliberately generous — a snapshot costs one
 * revision directory, pruned like any other, while a missed one can cost a
 * writer their only copy.
 */
export const DESTRUCTIVE_SURVIVING_RATIO = 0.5;

/**
 * Minimum number of words a change must remove before the ratio above is
 * consulted, so trimming a two-word stub does not mint a revision.
 *
 * CHOSEN, NOT MEASURED, for the same reason as the ratio. Emptying a resource
 * bypasses this floor entirely — see {@link isDestructiveContentChange}.
 */
export const MIN_WORDS_LOST = 10;

/**
 * Counts the words in a stored revision body.
 *
 * Revision content is normally serialized TipTap JSON, but legacy revisions
 * hold raw plain text; anything that does not parse as a document is counted
 * as the text it is rather than treated as empty, which would otherwise read
 * as total loss and snapshot on every save.
 */
export function revisionWordCount(content: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return countWords(content);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { type?: unknown }).type !== "doc"
  ) {
    return countWords(content);
  }

  return countWords(tiptapToPlainText(parsed as TipTapDocument));
}

/**
 * True when replacing `previous` with `next` removes enough content that the
 * previous state should be preserved as its own revision first.
 *
 * Two ways to qualify:
 *
 * - `next` has no words at all and `previous` had some. Emptying a resource is
 *   the clearest destruction there is, and it is what an undo overshoot
 *   produces, so it qualifies at any size — a four-word document emptied is
 *   still the writer's only copy of those four words.
 * - At least {@link MIN_WORDS_LOST} words are gone AND at most
 *   {@link DESTRUCTIVE_SURVIVING_RATIO} of them survive.
 *
 * Growth and ordinary editing never qualify, so the common path adds no
 * revisions at all.
 */
export function isDestructiveContentChange(
  previous: string,
  next: string,
): boolean {
  const previousWords = revisionWordCount(previous);
  if (previousWords === 0) return false;

  const nextWords = revisionWordCount(next);
  if (nextWords === 0) return true;

  const lost = previousWords - nextWords;
  if (lost < MIN_WORDS_LOST) return false;

  return nextWords <= previousWords * DESTRUCTIVE_SURVIVING_RATIO;
}
