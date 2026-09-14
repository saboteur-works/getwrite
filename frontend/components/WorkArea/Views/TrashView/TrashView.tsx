"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useAppSelector from "../../../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../../../src/store/projectsSlice";
import {
  listTrash,
  purgeTrashItems,
  restoreTrashItems,
} from "../../../../src/lib/api/trash";
import type {
  TrashedFolderEntry,
  TrashedResourceEntry,
} from "../../../../src/lib/api/trash";
import ConfirmDialog from "../../../common/ConfirmDialog";

export interface TrashViewProps {
  /** Optional className for the outer container. */
  className?: string;
}

/**
 * A batch action awaiting confirmation. `restore` and `purge` both carry the
 * exact set of top-level ids the batch was built from at the moment the
 * writer triggered it (rather than re-reading state at confirm time), so a
 * listing change that races the open `ConfirmDialog` can't silently widen or
 * narrow what gets confirmed. `isEmptyTrash` only affects the dialog's
 * wording ("Empty trash" vs. "Delete N items permanently") — the request
 * itself is always an explicit id array, never `PurgeSelection`'s `{ all:
 * true }` shorthand, so a caller reading the per-item report always sees the
 * same ids it asked for.
 */
type PendingBatchAction =
  | { kind: "restore"; ids: string[] }
  | { kind: "purge"; ids: string[]; isEmptyTrash: boolean };

/**
 * `TrashView` is the project-wide Trash tab (`specs/features/trash-ui.md`
 * FR-1/FR-4, Task 15; FR-2/FR-13/FR-21, Task 17). Like `OrganizerView`/
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
 * Task 17 adds multi-select restore, multi-select permanent delete, and an
 * "Empty trash" action, each behind a single `ConfirmDialog` confirmation
 * for the whole batch (FR-2) rather than one confirmation per item. Every
 * batch action calls the Task 12 client functions (`restoreTrashItems`/
 * `purgeTrashItems`), which return one outcome per requested id rather than
 * failing the whole batch for one bad item; a failed item is left in the
 * list (never dropped silently) and the batch's outcome is summarized in a
 * `data-testid="trash-batch-report"` line (e.g. "2 of 3 permanently deleted;
 * 1 failed.").
 *
 * FR-21/OQ-11: purging or restoring a resource that's currently open in an
 * editor tab needs no handling here. `AppShell.tsx` already removed it from
 * `resourcesSlice` when it was first soft-deleted (the existing
 * `removeResource` dispatch, `:1124-1131`) — trashed content is, by
 * definition, already absent from that slice, so nothing this view does to
 * its own local `resources`/`folders` state touches `resourcesSlice`, and no
 * new open-tab UI is added. The existing "Resource not found." fallback is
 * exercised, unchanged, by whatever stale selection already pointed at the
 * now-trashed (and now purged) resource.
 */
export default function TrashView({
  className = "",
}: TrashViewProps): JSX.Element {
  const projectId = useAppSelector((s) => selectActiveProjectDirectoryId(s));

  const [resources, setResources] = useState<TrashedResourceEntry[]>([]);
  const [folders, setFolders] = useState<TrashedFolderEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<PendingBatchAction | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const allTopLevelIds = useMemo(
    () => [...resources.map((r) => r.id), ...folders.map((f) => f.id)],
    [resources, folders],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const openRestoreSelectedDialog = useCallback(() => {
    if (selectedIds.size === 0) return;
    setReport(null);
    setActionError(null);
    setPendingAction({ kind: "restore", ids: Array.from(selectedIds) });
  }, [selectedIds]);

  const openDeleteSelectedDialog = useCallback(() => {
    if (selectedIds.size === 0) return;
    setReport(null);
    setActionError(null);
    setPendingAction({
      kind: "purge",
      ids: Array.from(selectedIds),
      isEmptyTrash: false,
    });
  }, [selectedIds]);

  const openEmptyTrashDialog = useCallback(() => {
    if (allTopLevelIds.length === 0) return;
    setReport(null);
    setActionError(null);
    setPendingAction({
      kind: "purge",
      ids: allTopLevelIds,
      isEmptyTrash: true,
    });
  }, [allTopLevelIds]);

  const cancelPendingAction = useCallback(() => {
    if (isSubmitting) return;
    setPendingAction(null);
  }, [isSubmitting]);

  const confirmPendingAction = useCallback(() => {
    if (!pendingAction || !projectId || isSubmitting) return;
    const action = pendingAction;
    setIsSubmitting(true);

    const request =
      action.kind === "restore"
        ? restoreTrashItems(projectId, action.ids)
        : purgeTrashItems(projectId, action.ids);

    void request
      .then((results) => {
        const succeededIds = new Set(
          results.filter((result) => result.ok).map((result) => result.id),
        );
        const total = results.length;
        const succeededCount = succeededIds.size;
        const failedCount = total - succeededCount;

        setResources((prev) => prev.filter((r) => !succeededIds.has(r.id)));
        setFolders((prev) => prev.filter((f) => !succeededIds.has(f.id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          succeededIds.forEach((id) => next.delete(id));
          return next;
        });

        const verb =
          action.kind === "restore" ? "restored" : "permanently deleted";
        setReport(
          failedCount > 0
            ? `${succeededCount} of ${total} ${verb}; ${failedCount} failed.`
            : `${succeededCount} of ${total} ${verb}.`,
        );
        setPendingAction(null);
      })
      .catch(() => {
        setActionError(
          action.kind === "restore"
            ? "Could not restore the selected items. Try again later."
            : "Could not permanently delete the selected items. Try again later.",
        );
        setPendingAction(null);
      })
      .finally(() => setIsSubmitting(false));
  }, [pendingAction, projectId, isSubmitting]);

  const dialogTitle = !pendingAction
    ? ""
    : pendingAction.kind === "restore"
      ? "Restore items"
      : pendingAction.isEmptyTrash
        ? "Empty trash"
        : "Delete items permanently";

  const dialogDescription = !pendingAction
    ? undefined
    : pendingAction.kind === "restore"
      ? `Restore ${pendingAction.ids.length} item${
          pendingAction.ids.length === 1 ? "" : "s"
        } from Trash?`
      : pendingAction.isEmptyTrash
        ? `Permanently delete all ${pendingAction.ids.length} item${
            pendingAction.ids.length === 1 ? "" : "s"
          } in Trash? This cannot be undone.`
        : `Permanently delete ${pendingAction.ids.length} item${
            pendingAction.ids.length === 1 ? "" : "s"
          }? This cannot be undone.`;

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

      {/* The batch report/error live outside the `!isEmpty` gate below,
          deliberately: a successful "Empty trash" (or a batch that purges
          every remaining item) makes `isEmpty` true in the very same state
          update that sets the report, and the report must still be visible
          on the resulting "Trash is empty." screen rather than disappearing
          along with the now-gone list (FR-2's per-item outcome report). */}
      {report && (
        <p role="status" data-testid="trash-batch-report">
          {report}
        </p>
      )}
      {actionError && (
        <p role="alert" data-testid="trash-batch-error">
          {actionError}
        </p>
      )}

      {isEmpty && <p data-testid="trash-empty-state">Trash is empty.</p>}

      {!isLoading && !error && !isEmpty && (
        <>
          <div data-testid="trash-batch-toolbar" className="flex gap-2 mb-2">
            <button
              type="button"
              data-testid="trash-restore-selected"
              onClick={openRestoreSelectedDialog}
              disabled={selectedIds.size === 0 || isSubmitting}
            >
              Restore selected
            </button>
            <button
              type="button"
              data-testid="trash-delete-selected"
              onClick={openDeleteSelectedDialog}
              disabled={selectedIds.size === 0 || isSubmitting}
            >
              Delete selected permanently
            </button>
            <button
              type="button"
              data-testid="trash-empty-trash"
              onClick={openEmptyTrashDialog}
              disabled={isSubmitting}
            >
              Empty trash
            </button>
          </div>

          <ul data-testid="trash-list">
            {resources.map((resource) => (
              <li
                key={resource.id}
                data-testid="trash-row"
                data-trash-kind="resource"
                data-trash-id={resource.id}
              >
                <input
                  type="checkbox"
                  data-testid="trash-row-select"
                  aria-label={`Select ${resource.originalName}`}
                  checked={selectedIds.has(resource.id)}
                  onChange={() => toggleSelected(resource.id)}
                />
                <div data-testid="trash-row-label">{resource.originalName}</div>
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
                <input
                  type="checkbox"
                  data-testid="trash-row-select"
                  aria-label={`Select ${folder.originalName}`}
                  checked={selectedIds.has(folder.id)}
                  onChange={() => toggleSelected(folder.id)}
                />
                <div data-testid="trash-row-label">{folder.originalName}</div>
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
                            no select checkbox or actions can be wired in
                            here. A manifest entry carries no name, only kind
                            + id. */}
                        {descendant.kind} {descendant.id}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        isOpen={pendingAction !== null}
        title={dialogTitle}
        description={dialogDescription}
        confirmLabel={
          pendingAction?.kind === "restore" ? "Restore" : "Delete permanently"
        }
        cancelLabel="Cancel"
        onConfirm={confirmPendingAction}
        onCancel={cancelPendingAction}
        isConfirmDisabled={isSubmitting}
      />
    </div>
  );
}
