/**
 * @module split-lineage-resolver
 *
 * Pure resolver for Feature 120 FR-15: given a lineage record and what a
 * reader found on disk, name exactly one of the five lineage states. It does
 * no I/O and takes every observation as an argument; the read side that
 * gathers them belongs to the undo core. Nothing here presents a state to a
 * writer.
 *
 * Observations mirror the stored layout: the live sidecar
 * (`meta/resource-<id>.meta.json`), the snapshot revision folder under
 * `revisions/<id>/`, the trashed sidecar (`.trash/meta/`) and the trashed
 * revisions (`.trash/revisions/<id>`).
 */
import type { MergedMark, MergeMarkStateResult } from "./merge-types";
import type {
  SplitLineageRecord,
  SplitLineageStateResult,
} from "./split-types";

/**
 * What one read found. A failed read is its own value and never the same as
 * an absent one (`docs/standards/failure-visibility.md`).
 */
export type SplitLineageProbe =
  | { read: "present" }
  | { read: "absent" }
  | { read: "failed"; cause: string };

/** Everything the resolver needs; defined here because only Task 9 edits `split-types.ts`. */
export interface SplitLineageResolverInput {
  record: SplitLineageRecord;
  /** The source document's live sidecar. */
  liveDocument: SplitLineageProbe;
  /** The record's snapshot revision among the source's live revisions. */
  liveSnapshotRevision: SplitLineageProbe;
  /** The source document's trashed sidecar. */
  trashedDocument: SplitLineageProbe;
  /** The source document's revisions under `.trash/revisions`. */
  trashedRevisions: SplitLineageProbe;
}

/**
 * Feature 121 (FR-5): the same observations for a merged mark. The named
 * document is the mark's target and the named revision its snapshot; the
 * probes are taken for those two ids. The resolver reads none of the mark's
 * fields (`experiments/task-7.md`), so `mark` only types the input.
 */
export interface MergedMarkResolverInput {
  mark: MergedMark;
  /** The target document's live sidecar. */
  liveDocument: SplitLineageProbe;
  /** The mark's snapshot revision among the target's live revisions. */
  liveSnapshotRevision: SplitLineageProbe;
  /** The target document's trashed sidecar. */
  trashedDocument: SplitLineageProbe;
  /** The target document's revisions under `.trash/revisions`. */
  trashedRevisions: SplitLineageProbe;
}

function couldNotBeChecked(probe: SplitLineageProbe): SplitLineageStateResult {
  const cause = probe.read === "failed" ? probe.cause : "unknown";
  return { state: "could-not-be-checked", cause };
}

/** Resolve a merged mark's target and snapshot into one of five states. */
export function resolveMergedMarkState(
  input: MergedMarkResolverInput,
): MergeMarkStateResult {
  const resolved = resolveProbes(input);
  switch (resolved.state) {
    case "document-in-trash":
      return { state: "target-in-trash" };
    case "document-permanently-removed":
      return { state: "target-permanently-removed" };
    default:
      return resolved;
  }
}

/** Resolve the lineage record against what was read into one of five states. */
export function resolveSplitLineageState(
  input: SplitLineageResolverInput,
): SplitLineageStateResult {
  return resolveProbes(input);
}

/** The four observations both inputs carry. */
type LineageProbes = Pick<
  SplitLineageResolverInput,
  | "liveDocument"
  | "liveSnapshotRevision"
  | "trashedDocument"
  | "trashedRevisions"
>;

function resolveProbes(input: LineageProbes): SplitLineageStateResult {
  const { liveDocument, liveSnapshotRevision } = input;
  if (liveDocument.read === "failed") return couldNotBeChecked(liveDocument);
  if (liveDocument.read === "present") {
    if (liveSnapshotRevision.read === "failed") {
      return couldNotBeChecked(liveSnapshotRevision);
    }
    return liveSnapshotRevision.read === "present"
      ? { state: "available" }
      : { state: "revision-no-longer-kept" };
  }
  const trashProbes = [input.trashedDocument, input.trashedRevisions];
  if (trashProbes.some((probe) => probe.read === "present")) {
    return { state: "document-in-trash" };
  }
  const failed = trashProbes.find((probe) => probe.read === "failed");
  if (failed) return couldNotBeChecked(failed);
  return { state: "document-permanently-removed" };
}
