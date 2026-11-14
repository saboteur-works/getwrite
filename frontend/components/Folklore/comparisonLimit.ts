import type { ComparisonColumnLimit } from "../../src/lib/models/folklore-types";

/**
 * The most variants the side-by-side comparison opens at once (Feature 110,
 * FR-12). A selection beyond it is refused with a message that states this
 * figure and is never silently shortened.
 *
 * 3 is the owner's pick from the recorded long-text run in
 * `specs/features/folklore-variants/experiments/task-28.md` (2026-11-14).
 * Task 29 is the only task that sets it.
 */
export const COMPARISON_COLUMN_LIMIT: ComparisonColumnLimit = 3;
