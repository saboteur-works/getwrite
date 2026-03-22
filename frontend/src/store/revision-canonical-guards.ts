/**
 * Pure guard functions that enforce the canonical revision invariant:
 * exactly one revision per resource can have `isCanonical: true` at any time.
 */

import type { RevisionEntry } from "./revision-normalization";

/**
 * Returns a new revision array where exactly one revision is marked canonical.
 *
 * All other revisions have `isCanonical` set to `false`.
 */
export function applyCanonicalRevision(
    revisions: RevisionEntry[],
    canonicalId: string,
): RevisionEntry[] {
    return revisions.map((revision) => ({
        ...revision,
        isCanonical: revision.id === canonicalId,
    }));
}

/**
 * Returns `true` when a canonical update targets a resource that is no longer
 * the active resource in the slice.
 *
 * A stale update must be ignored to prevent overwriting revision state for the
 * wrong resource.
 */
export function isStaleCanonicalUpdate(
    currentResourceId: string | null,
    updateResourceId: string,
): boolean {
    return currentResourceId !== null && currentResourceId !== updateResourceId;
}
