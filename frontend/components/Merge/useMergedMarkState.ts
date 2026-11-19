"use client";

import React from "react";
import { shallowEqual } from "react-redux";
import { fetchSplitResourceContent } from "../../src/lib/api/split-stored-read";
import { listTrash } from "../../src/lib/api/trash";
import { describeMergedMarkLabel } from "../../src/lib/models/merge-messages";
import type {
  MergedMark,
  MergeMarkState,
  MergeMarkStateResult,
} from "../../src/lib/models/merge-types";
import {
  resolveMergedMarkState,
  type SplitLineageProbe,
} from "../../src/lib/models/split-lineage-resolver";
import type { AnyResource } from "../../src/lib/models/types";
import { useAppSelector } from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import type { RootState } from "../../src/store/store";

/** A merged document and the mark as the client holds it (not yet shape-checked). */
export interface MergedMarkEntry {
  id: string;
  mark: unknown;
}

/** What a merged mark says now. */
export interface MergedMarkView {
  /** One of the resolver's states, or `checking` until the reads have finished. */
  state: MergeMarkState | "checking";
  /** The visible text, from `merge-messages.ts`; never blank. */
  label: string;
}

/**
 * Shown while the reads that tell the states apart are running. It names no
 * target and does not read as the live label, so a mark that could not be
 * read can never look live.
 */
export const MERGED_MARK_CHECKING_LABEL =
  "Merged into another document (checking)";

const NO_RESOURCES: readonly AnyResource[] = [];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** The mark when it has the three stored fields; `null` for any other value. */
export function parseMergedMark(value: unknown): MergedMark | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  const { targetDocumentId, targetSnapshotRevisionId, date } = record;
  if (
    !isNonEmptyString(targetDocumentId) ||
    !isNonEmptyString(targetSnapshotRevisionId) ||
    !isNonEmptyString(date)
  )
    return null;
  return { targetDocumentId, targetSnapshotRevisionId, date };
}

function failedProbe(error: unknown): SplitLineageProbe {
  return {
    read: "failed",
    cause: error instanceof Error ? error.message : "read failed",
  };
}

/** Is the mark's snapshot among the target's live revisions? */
async function probeSnapshot(
  projectDirectoryId: string,
  mark: MergedMark,
): Promise<SplitLineageProbe> {
  try {
    const content = await fetchSplitResourceContent(
      projectDirectoryId,
      mark.targetDocumentId,
    );
    if (content === null || !Array.isArray(content.revisions)) {
      return { read: "failed", cause: "the revision list could not be read" };
    }
    return content.revisions.some((r) => r.id === mark.targetSnapshotRevisionId)
      ? { read: "present" }
      : { read: "absent" };
  } catch (error: unknown) {
    return failedProbe(error);
  }
}

/** Is the target listed in Trash, on its own or under a trashed folder? */
async function probeTrash(
  listing: Promise<Awaited<ReturnType<typeof listTrash>>>,
  targetId: string,
): Promise<SplitLineageProbe> {
  try {
    const trash = await listing;
    const isListed =
      trash.resources.some((r) => r.id === targetId) ||
      trash.folders.some((f) => f.descendants.some((d) => d.id === targetId));
    return isListed ? { read: "present" } : { read: "absent" };
  } catch (error: unknown) {
    return failedProbe(error);
  }
}

/**
 * Gathers the observations for one mark and resolves them through the
 * generalised lineage resolver (Task 21). A target the tree holds is live and
 * its snapshot is looked for among its revisions; any other target is looked
 * for in Trash, and one found nowhere is permanently removed. A read that
 * fails is its own observation and resolves to could-not-be-checked.
 */
async function resolveMark(
  projectDirectoryId: string,
  mark: MergedMark,
  isLive: boolean,
  trashListing: () => Promise<Awaited<ReturnType<typeof listTrash>>>,
): Promise<MergeMarkStateResult> {
  const absent: SplitLineageProbe = { read: "absent" };
  if (isLive) {
    return resolveMergedMarkState({
      mark,
      liveDocument: { read: "present" },
      liveSnapshotRevision: await probeSnapshot(projectDirectoryId, mark),
      trashedDocument: absent,
      trashedRevisions: absent,
    });
  }
  // A purge removes the trashed revisions before the trashed sidecar, so a
  // document that is listed in Trash is the one signal needed for both probes.
  const inTrash = await probeTrash(trashListing(), mark.targetDocumentId);
  return resolveMergedMarkState({
    mark,
    liveDocument: absent,
    liveSnapshotRevision: absent,
    trashedDocument: inTrash,
    trashedRevisions: inTrash,
  });
}

function keyOf(mark: MergedMark, isLive: boolean): string {
  return `${mark.targetDocumentId}:${mark.targetSnapshotRevisionId}:${isLive ? "live" : "not-live"}`;
}

/**
 * The read side of FR-16: what each merged document's mark says, resolved from
 * the target id. One set of reads is made per distinct target and snapshot,
 * however many documents carry the mark, and the Trash listing is read at most
 * once per pass. A mark that is not well formed, or whose reads failed, is
 * could-not-be-checked; nothing here reads as blank or as a live target.
 *
 * @returns One view per entry id, in the order given.
 */
export function useMergedMarkViews(
  entries: readonly MergedMarkEntry[],
): ReadonlyMap<string, MergedMarkView> {
  const projectDirectoryId = useAppSelector((s: RootState) =>
    s.projects ? selectActiveProjectDirectoryId(s) : null,
  );
  const live = useAppSelector(
    (s: RootState) => s.resources?.resources ?? NO_RESOURCES,
    shallowEqual,
  );
  const names = React.useMemo(
    () => new Map(live.map((r) => [r.id, r.name])),
    [live],
  );
  const [results, setResults] = React.useState<
    ReadonlyMap<string, MergeMarkStateResult>
  >(new Map());

  const parsed = entries.map((e) => ({
    id: e.id,
    mark: parseMergedMark(e.mark),
  }));
  const wanted = new Map<string, MergedMark>();
  for (const { mark } of parsed) {
    if (mark) wanted.set(keyOf(mark, names.has(mark.targetDocumentId)), mark);
  }
  const signature = [...wanted.keys()].sort().join("|");

  React.useEffect(() => {
    if (projectDirectoryId === null || wanted.size === 0) return;
    let isCurrent = true;
    let listing: ReturnType<typeof listTrash> | null = null;
    const trashListing = () => (listing ??= listTrash(projectDirectoryId));
    for (const [key, mark] of wanted) {
      void resolveMark(
        projectDirectoryId,
        mark,
        key.endsWith(":live"),
        trashListing,
      )
        .catch(
          (error: unknown): MergeMarkStateResult => ({
            state: "could-not-be-checked",
            cause: error instanceof Error ? error.message : "read failed",
          }),
        )
        .then((result) => {
          if (!isCurrent) return;
          setResults((previous) => new Map(previous).set(key, result));
        });
    }
    return () => {
      isCurrent = false;
    };
    // `wanted` is rebuilt every render; `signature` names its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDirectoryId, signature]);

  const views = new Map<string, MergedMarkView>();
  for (const { id, mark } of parsed) {
    if (!mark || projectDirectoryId === null) {
      // No well-formed mark, or no open project to read from: nothing can be
      // resolved, which is stated, never left as "checking" or a live label.
      const result: MergeMarkStateResult = {
        state: "could-not-be-checked",
        cause: mark ? "no project is open" : "the mark is not well formed",
      };
      views.set(id, {
        state: result.state,
        label: describeMergedMarkLabel(result, null),
      });
      continue;
    }
    const isLive = names.has(mark.targetDocumentId);
    const result = results.get(keyOf(mark, isLive));
    if (!result) {
      views.set(id, { state: "checking", label: MERGED_MARK_CHECKING_LABEL });
      continue;
    }
    views.set(id, {
      state: result.state,
      label: describeMergedMarkLabel(
        result,
        names.get(mark.targetDocumentId) ?? null,
      ),
    });
  }
  return views;
}
