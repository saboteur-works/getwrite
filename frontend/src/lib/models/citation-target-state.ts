/**
 * @module citation-target-state
 *
 * Pure derivation of what a citation points at (Feature 103, FR-27, OQ-2,
 * OQ-168). From an annotation `target` and plain inputs saying what exists,
 * it returns a state and the name to show.
 *
 * - A missing Source, attachment or excerpt is a named state, never hidden,
 *   shown as pointing at nothing, or deleted: the state set has no such value.
 * - The name shown is `target.sourceName`, kept from citing time; a rename
 *   after the citation does not change it. The current name is used only when
 *   the target saved none and the Source still exists.
 * - A Source that is in Trash or purged has `sourceRemoved: true`; the caller
 *   shows it as removed, with `displayName` when there is one.
 * - Nothing is read, written or logged, and no index of where a Source is
 *   cited is built or implied. No imports besides types, so the file is
 *   reachable from the shared core under FR-4.
 */
import type { AnnotationTarget } from "./types";

/** Where the cited Source is now. `absent` means purged (or never existed). */
export type CitationSourceStatus = "present" | "in-trash" | "absent";

/** Plain description of what exists; the caller fills it from storage. */
export interface CitationTargetFacts {
  source: CitationSourceStatus;
  /** The Source's current name, used only when the target saved none. */
  currentSourceName?: string;
  /** Read only when the target has an `attachmentId`. */
  attachment?: "present" | "removed";
  /** Read only when the target has an `excerptId`. */
  excerpt?: "present" | "removed";
}

export type CitationTargetState =
  | "present"
  | "source-in-trash"
  | "source-purged"
  | "attachment-removed"
  | "excerpt-removed";

export interface CitationTargetView {
  state: CitationTargetState;
  /** Name to show; undefined only when no name was saved and the Source is gone. */
  displayName: string | undefined;
  /** True when the Source is in Trash or purged. */
  sourceRemoved: boolean;
}

function pickState(
  target: AnnotationTarget,
  facts: CitationTargetFacts,
): CitationTargetState {
  if (facts.source === "in-trash") return "source-in-trash";
  if (facts.source === "absent") return "source-purged";
  if (target.attachmentId !== undefined && facts.attachment === "removed") {
    return "attachment-removed";
  }
  if (target.excerptId !== undefined && facts.excerpt === "removed") {
    return "excerpt-removed";
  }
  return "present";
}

/** Derive the state and display name of a citation's target. Pure. */
export function deriveCitationTargetState(
  target: AnnotationTarget,
  facts: CitationTargetFacts,
): CitationTargetView {
  const isSourceRemoved = facts.source !== "present";
  const saved = target.sourceName;
  const displayName =
    saved !== undefined && saved !== ""
      ? saved
      : isSourceRemoved
        ? undefined
        : facts.currentSourceName;
  return {
    state: pickState(target, facts),
    displayName,
    sourceRemoved: isSourceRemoved,
  };
}
