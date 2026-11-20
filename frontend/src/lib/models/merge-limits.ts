/**
 * @module merge-limits
 *
 * The fixed maximum number of documents of one merge (Feature 121 FR-15,
 * OQ-5) and the pure check against it. The value was set by the owner in
 * Task 14 from the Task 13 timings; see
 * `specs/features/merge-documents/experiments/task-14.md`. The same constant
 * is enforced by the client dialog and by the server. No I/O, no React, no
 * JSX, no JSON, no `node:*`.
 */

/** Most documents (the target included) one merge may take. */
export const MERGE_DOCUMENT_CAP = 25;

/** Fewest documents a merge needs: a target and one absorbed document. */
const MERGE_DOCUMENT_MINIMUM = 2;

/**
 * True when `count` is a whole number from two up to and including
 * `MERGE_DOCUMENT_CAP`. A fractional, negative or non-finite count is not
 * within it. A count below two is a different refusal in `merge-eligibility`;
 * this function only answers whether the count fits the range of one merge.
 */
export function isMergeDocumentCountWithinCap(count: number): boolean {
  return (
    Number.isInteger(count) &&
    count >= MERGE_DOCUMENT_MINIMUM &&
    count <= MERGE_DOCUMENT_CAP
  );
}
