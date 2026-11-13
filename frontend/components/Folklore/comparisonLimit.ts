import type { ComparisonColumnLimit } from "../../src/lib/models/folklore-types";

/**
 * The most variants the side-by-side comparison opens at once (Feature 110,
 * FR-12). `null` means "not yet measured": no refusal is committed and no
 * figure is claimed or shown anywhere. The figure waits for the recorded
 * long-text run (Task 28); Task 29 is the only task that sets it, from that
 * run and nothing else.
 */
export const COMPARISON_COLUMN_LIMIT: ComparisonColumnLimit = null;
