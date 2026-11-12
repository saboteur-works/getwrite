/**
 * @module organizerGridCap
 * The Organizer grid's card cap: the most cards the grid shows across all
 * cells. Counts cards, not appearances (a card in several cells counts once).
 * The grid reports the cards past the cap in a visible "N not shown" message.
 */

/**
 * The card cap: 500 cards, set by the owner on 2026-11-12 from the recorded
 * large-project runs (`specs/features/organizer-grid/experiments/task-42.md`,
 * `task-42-measurement-desktop.md`, `task-42-measurement-desktop-2.md`).
 * `null` would mean no cap. Change it only from a new recorded run.
 */
export const ORGANIZER_GRID_CARD_CAP: number | null = 500;

/** How a card count divides under a cap. */
export interface CardCapResult {
  /** Cards to render. */
  shown: number;
  /** Cards past the cap, to be reported as "N not shown". */
  notShown: number;
}

const isNonNegativeInteger = (n: number): boolean =>
  Number.isInteger(n) && n >= 0;

/**
 * Applies a cap to a card count.
 *
 * @param cardCount - Number of cards (not appearances) before the cap.
 * @param cap - A positive integer, or `null` for no cap. Defaults to
 *   {@link ORGANIZER_GRID_CARD_CAP}.
 * @throws RangeError when `cardCount` is not a non-negative integer or `cap`
 *   is neither `null` nor a positive integer; a bad figure is never read as
 *   "no cap".
 */
export function applyCardCap(
  cardCount: number,
  cap: number | null = ORGANIZER_GRID_CARD_CAP,
): CardCapResult {
  if (!isNonNegativeInteger(cardCount)) {
    throw new RangeError("cardCount must be a non-negative integer");
  }
  if (cap === null) {
    return { shown: cardCount, notShown: 0 };
  }
  if (!Number.isInteger(cap) || cap <= 0) {
    throw new RangeError("cap must be null or a positive integer");
  }
  const shown = Math.min(cardCount, cap);
  return { shown, notShown: cardCount - shown };
}
