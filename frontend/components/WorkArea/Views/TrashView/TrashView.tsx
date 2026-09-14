"use client";

import { useCallback, useEffect, useState } from "react";
import useAppSelector from "../../../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../../../src/store/projectsSlice";
import { listTrash } from "../../../../src/lib/api/trash";
import type {
  TrashedFolderEntry,
  TrashedResourceEntry,
} from "../../../../src/lib/api/trash";

export interface TrashViewProps {
  /** Optional className for the outer container. */
  className?: string;
}

/**
 * `TrashView` is the project-wide Trash tab's read-only listing half
 * (`specs/features/trash-ui.md` FR-1/FR-4, Task 15). Like `OrganizerView`/
 * `TimelineView`/`EntityRosterView`, it has no dependency on the currently
 * selected resource in the resource tree — it fetches Task 12's `listTrash`
 * itself, on mount and on `projectId` change.
 *
 * Renders trashed resources and trashed top-level folders together as
 * top-level rows. A trashed folder's former contents (`descendants`, Task 6's
 * manifest) are shown nested *inside* that folder's row, for visibility
 * only — a nested descendant has no restore/purge control of its own
 * (resolved OQ-3/FR-4): restoring or purging happens at the top-level
 * folder, which carries every descendant with it.
 *
 * Restore/purge controls themselves are added in a later task (Task 17).
 * This task renders each top-level row inside a `data-testid="trash-row"`
 * wrapper with a dedicated `data-testid="trash-row-actions"` slot — present
 * but empty — so Task 17 can drop its buttons in without restructuring the
 * row. A nested descendant row carries no such slot at all, which is what
 * structurally (not just visually) distinguishes it as non-actionable.
 *
 * A descendant manifest entry (`TrashFolderManifestEntry`) records only its
 * `id`/`kind`/`parentId`/`orderIndex` — no name — so nested rows are
 * labeled by kind and id rather than by the name they had before deletion.
 */
export default function TrashView({
  className = "",
}: TrashViewProps): JSX.Element {
  const projectId = useAppSelector((s) => selectActiveProjectDirectoryId(s));

  const [resources, setResources] = useState<TrashedResourceEntry[]>([]);
  const [folders, setFolders] = useState<TrashedFolderEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!projectId) {
      setResources([]);
      setFolders([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    void listTrash(projectId)
      .then((listing) => {
        setResources(listing.resources);
        setFolders(listing.folders);
      })
      .catch(() => {
        // FR-1: listTrash rejects rather than degrading (see
        // lib/api/trash.ts's doc comment) — surface that as a distinct
        // error state rather than falling through to the empty state,
        // which would misleadingly read as "Trash is empty."
        setError("Could not load Trash. Try again later.");
      })
      .finally(() => setIsLoading(false));
  }, [projectId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const isEmpty =
    !isLoading && !error && resources.length === 0 && folders.length === 0;

  return (
    <div className={className} data-testid="trash-view">
      <h2 className="workarea-section-title">Trash</h2>

      {isLoading && (
        <p className="text-gw-nano text-gw-secondary" role="status">
          Loading Trash&hellip;
        </p>
      )}

      {error && (
        <p role="alert" data-testid="trash-error">
          {error}
        </p>
      )}

      {isEmpty && <p data-testid="trash-empty-state">Trash is empty.</p>}

      {!isLoading && !error && !isEmpty && (
        <ul data-testid="trash-list">
          {resources.map((resource) => (
            <li
              key={resource.id}
              data-testid="trash-row"
              data-trash-kind="resource"
              data-trash-id={resource.id}
            >
              <div data-testid="trash-row-label">{resource.originalName}</div>
              {/* Present but empty — Task 17 fills this in with the
                  restore/purge controls for this row. */}
              <div data-testid="trash-row-actions" />
            </li>
          ))}

          {folders.map((folder) => (
            <li
              key={folder.id}
              data-testid="trash-row"
              data-trash-kind="folder"
              data-trash-id={folder.id}
            >
              <div data-testid="trash-row-label">{folder.originalName}</div>
              {/* Present but empty — Task 17 fills this in with the
                  restore/purge controls for this row. */}
              <div data-testid="trash-row-actions" />

              {folder.descendants.length > 0 && (
                <ul data-testid="trash-nested-list">
                  {folder.descendants.map((descendant) => (
                    <li
                      key={descendant.id}
                      data-testid="trash-nested-row"
                      data-trash-kind={descendant.kind}
                      data-trash-id={descendant.id}
                    >
                      {/* Nested descendants are read-only: no restore/purge
                          control of their own, and — unlike a top-level
                          row above — no `trash-row-actions` slot at all, so
                          Task 17 cannot accidentally wire one in here. A
                          manifest entry carries no name, only kind + id. */}
                      {descendant.kind} {descendant.id}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
