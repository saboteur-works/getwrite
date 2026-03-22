import type { Revision } from "../lib/models/types";

/**
 * Revision shape stored in Redux for the selected resource.
 *
 * This extends the persisted revision metadata with a display label used by
 * `RevisionControl`.
 */
export interface RevisionEntry extends Revision {
    /** Human-readable label shown in the revision list UI. */
    displayName: string;
}

/**
 * Returns a human-readable display label for a revision.
 */
export function resolveRevisionDisplayName(
    revision: Revision,
    fallbackName?: string,
): string {
    const metadataName =
        revision.metadata && typeof revision.metadata === "object"
            ? revision.metadata["name"]
            : undefined;

    if (typeof metadataName === "string" && metadataName.trim().length > 0) {
        return metadataName.trim();
    }

    if (typeof fallbackName === "string" && fallbackName.trim().length > 0) {
        return fallbackName.trim();
    }

    return `Revision v${revision.versionNumber}`;
}

/**
 * Converts a persisted revision record into the slice entry shape.
 */
export function toRevisionEntry(
    revision: Revision,
    fallbackName?: string,
): RevisionEntry {
    return {
        ...revision,
        displayName: resolveRevisionDisplayName(revision, fallbackName),
    };
}

/**
 * Type guard for revision payload values.
 */
export function isRevision(value: unknown): value is Revision {
    return (
        !!value &&
        typeof value === "object" &&
        "id" in value &&
        "resourceId" in value &&
        "versionNumber" in value &&
        "createdAt" in value &&
        "filePath" in value &&
        "isCanonical" in value
    );
}

/**
 * Sorts revisions newest-first by version number.
 */
export function sortRevisionsDescending(
    revisions: RevisionEntry[],
): RevisionEntry[] {
    return [...revisions].sort((a, b) => b.versionNumber - a.versionNumber);
}

/**
 * Extracts and normalizes revisions from the list API payload.
 */
export function parseRevisionEntries(payload: unknown): RevisionEntry[] {
    if (!payload || typeof payload !== "object") {
        return [];
    }

    const rawRevisions =
        "revisions" in payload
            ? (payload as { revisions?: unknown }).revisions
            : payload;

    if (!Array.isArray(rawRevisions)) {
        return [];
    }

    return sortRevisionsDescending(
        rawRevisions
            .filter(isRevision)
            .map((revision) => toRevisionEntry(revision)),
    );
}

/**
 * Resolves the best default active revision for a loaded list.
 */
export function resolveCurrentRevisionId(
    revisions: RevisionEntry[],
): string | null {
    const canonical = revisions.find((revision) => revision.isCanonical);
    if (canonical) {
        return canonical.id;
    }

    return revisions[0]?.id ?? null;
}
