"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useAppSelector from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { selectResources } from "../../src/store/resourcesSlice";
import { listAttachments } from "../../src/lib/api/source-attachments";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { subscribeAttachmentCounts } from "./useSourceAttachments";

/** One row of the Sources view. */
interface SourceRow {
  id: string;
  name: string;
  /** The Source's `resourceSubtype`, or an empty string when none. */
  subtype: string;
  attachmentCount: number;
}

type SourceListState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; rows: SourceRow[] }
  | { status: "failed"; isLocked: boolean; message: string };

export interface SourceListResult {
  state: SourceListState;
  /** Reads the attachment counts again. */
  retry: () => void;
}

interface SourceStub {
  id: string;
  name: string;
  subtype: string;
}

/**
 * The project's Sources: every resource of type `source` from the resources
 * slice, with the attachment count read per Source through the existing
 * `listAttachments`. One failed read makes the whole list a failure; it is
 * never shown as a smaller list or as an empty project
 * (`docs/standards/failure-visibility.md`).
 */
export function useSourceList(): SourceListResult {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const resources = useAppSelector((s) => selectResources(s.resources));
  const stubs = useMemo<SourceStub[]>(
    () =>
      resources
        .filter((resource) => resource.type === "source")
        .map((resource) => ({
          id: resource.id,
          name: resource.name,
          subtype: resource.resourceSubtype ?? "",
        })),
    [resources],
  );
  // Counts are re-read when the set of Sources changes, not on a rename.
  const idKey = stubs.map((stub) => stub.id).join("\n");
  const [attempt, setAttempt] = useState(0);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [failure, setFailure] = useState<{
    isLocked: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (projectId === null || idKey === "") {
      setCounts({});
      setFailure(null);
      return;
    }
    let isCurrent = true;
    setCounts(null);
    setFailure(null);
    Promise.all(
      idKey.split("\n").map(async (id) => {
        const entries = await listAttachments(projectId, id);
        return [id, entries.length] as const;
      }),
    ).then(
      (pairs) => {
        if (isCurrent) setCounts(Object.fromEntries(pairs));
      },
      (error: unknown) => {
        if (!isCurrent) return;
        setFailure({
          isLocked: isLockedAccessError(error),
          message:
            error instanceof Error && error.message
              ? error.message
              : "The Sources could not be read.",
        });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [projectId, idKey, attempt]);

  // A panel's add or remove changes one row's count without a new read.
  useEffect(
    () =>
      subscribeAttachmentCounts((changedProjectId, sourceId, count) => {
        if (changedProjectId !== projectId) return;
        setCounts((previous) =>
          previous === null || previous[sourceId] === undefined
            ? previous
            : { ...previous, [sourceId]: count },
        );
      }),
    [projectId],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  let state: SourceListState;
  if (failure) {
    state = { status: "failed", ...failure };
  } else if (counts === null) {
    state = { status: "loading" };
  } else if (stubs.length === 0) {
    state = { status: "empty" };
  } else {
    state = {
      status: "ready",
      rows: stubs.map((stub) => ({
        ...stub,
        attachmentCount: counts[stub.id] ?? 0,
      })),
    };
  }
  return { state, retry };
}
