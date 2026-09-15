"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useAppSelector, { useAppDispatch } from "../../../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../../../src/store/projectsSlice";
import {
  loadResources,
  setFolders as setProjectFolders,
} from "../../../../src/store/resourcesSlice";
import { openProject } from "../../../../src/lib/api/projects";
import {
  listTrash,
  purgeTrashItems,
  restoreTrashItems,
} from "../../../../src/lib/api/trash";
import type {
  RestoreItemResult,
  TrashedFolderEntry,
  TrashedResourceEntry,
} from "../../../../src/lib/api/trash";
import ConfirmDialog from "../../../common/ConfirmDialog";
import Button from "../../../common/UI/Button/Button";
import Checkbox from "../../../common/UI/Checkbox/Checkbox";

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
 * One distinct, per-item notice surfaced after a restore batch completes
 * (Task 18, FR-5/FR-9/FR-14) — a relocation-to-project-root, a rename-on-
 * collision, or a set of references that could not be relinked. These are
 * kept separate from `report`'s generic "N of M restored" batch count
 * (Task 17) rather than folded into it, because each is actionable
 * information about a *specific* item, not a count.
 *
 * `renamed` notices state the item was restored as `"<name> (restored)"` —
 * `restoreTrashItems`'s per-item result only carries a `renamed: boolean`
 * flag, not the actual resolved name (a second/third collision on the same
 * name is suffixed `" (restored 2)"`, `" (restored 3)"`, ... by
 * `models/trash.ts`'s `resolveRestoreCollisionName`), so this notice names
 * the first-collision convention rather than the item's true final name.
 * Widening `RestoreItemResult` to also carry the resolved name is out of
 * this task's file scope (`TrashView.tsx` + its tests only) — see the
 * Task 18 follow-up recorded in `specs/features/trash-ui/follow-up-work.md`.
 */
interface RestoreNotice {
  id: string;
  kind: "relocated" | "renamed" | "references";
  text: string;
}

/**
 * Builds the Task 18 per-item restore notices from a batch of successful
 * `restoreTrashItems` results (FR-5/FR-9/FR-14). A failed item (`ok: false`)
 * contributes no notice — its failure is already covered by the generic
 * batch report. `referencesNotRestored === "no-record"` (a legacy item with
 * no Task 4 ref record at all) is not itself a notice-worthy outcome and is
 * skipped, distinct from a non-empty array of actually-unrelinked
 * references.
 */
function buildRestoreNotices(
  results: RestoreItemResult[],
  namesById: Map<string, string>,
): RestoreNotice[] {
  const notices: RestoreNotice[] = [];

  for (const result of results) {
    if (!result.ok) continue;
    const name = namesById.get(result.id) ?? result.id;

    if (result.relocated) {
      notices.push({
        id: result.id,
        kind: "relocated",
        text: `"${name}" was moved to project root because its original folder no longer exists.`,
      });
    }

    if (result.renamed) {
      const restoredName = result.restoredName ?? `${name} (restored)`;
      notices.push({
        id: result.id,
        kind: "renamed",
        text: `"${name}" was restored as "${restoredName}" because another item already has that name.`,
      });
    }

    if (
      Array.isArray(result.referencesNotRestored) &&
      result.referencesNotRestored.length > 0
    ) {
      const refDescriptions = result.referencesNotRestored
        .map((ref) =>
          ref.arrayIndex !== undefined
            ? `"${ref.fieldKey}"[${ref.arrayIndex}] on resource ${ref.referencingResourceId}`
            : `"${ref.fieldKey}" on resource ${ref.referencingResourceId}`,
        )
        .join(", ");
      notices.push({
        id: result.id,
        kind: "references",
        text: `"${name}": these references could not be restored automatically — ${refDescriptions}.`,
      });
    }
  }

  return notices;
}

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
 * its own local `resources`/`folders` state touches `resourcesSlice`'s
 * *selection* state, and no new open-tab UI is added. The existing
 * "Resource not found." fallback is exercised, unchanged, by whatever stale
 * selection already pointed at the now-trashed (and now purged) resource.
 *
 * Gate 6 finding (measured, `specs/features/trash-ui/tasks.md` Task 22):
 * before this fix, `confirmPendingAction`'s success branch dispatched
 * nothing to `resourcesSlice` on a successful restore — it only called
 * `setResources`/`setFolders` on this component's own local state (the
 * *Trash listing*, a different set of state than `resourcesSlice`'s
 * project-tree `resources`/`folders`) plus `setSelectedIds`/`setReport`/
 * `setRestoreNotices`. `resourcesSlice`'s `addResource` reducer — the one
 * existing action shaped to add a single item back to the tree — was never
 * called either. So a restored item never reached the sidebar resource tree
 * until a full reload re-ran `handleOpen`'s own `loadResources`/`setFolders`
 * dispatch (`app/(app)/page.tsx`). Fixed by having a successful restore
 * batch (`succeededCount > 0`) refetch the project's current resources/
 * folders via the same `openProject` call `handleOpen` uses, then dispatch
 * that pair itself — chosen over reconstructing added nodes from the batch
 * result because a folder restore's cascade of descendants isn't fully
 * described by `RestoreItemResult`.
 *
 * Gate 6 finding (measured, `specs/features/trash-ui/tasks.md` Task 25):
 * before this fix, the batch toolbar rendered three bare native `<button>`s
 * and each row a bare native `<input type="checkbox">`, with no row
 * container styling at all — unlike every sibling Work Area view. Fixed by
 * reusing the primitives already established elsewhere in this codebase for
 * an analogous role, confirmed by reading each component's own source before
 * using it: `ConfirmDialog.tsx` (already imported by this file, above) uses
 * `Button` (`common/UI/Button/Button.tsx`) with `variant="outline"` for its
 * Cancel action and `variant="destructive"` for its Confirm action, so the
 * batch toolbar below follows that same variant convention (`outline` for
 * Restore, `destructive` for the two permanent-delete actions); `Checkbox`
 * (`common/UI/Checkbox/Checkbox.tsx`) is the primitive `CompileResourceTree.tsx`
 * already uses for its own per-row selection checkboxes; and each top-level
 * row now carries the `workarea-list-item`/`workarea-list-item-label`/
 * `workarea-list-item-meta` classes `EntityRosterRow.tsx` (the nearest
 * sibling project-wide, list-shaped view) already applies to its own rows
 * (`styles/getwrite-utilities.css`). No `data-testid`, ARIA role, or
 * keyboard behavior from Tasks 15/17/18/19 changes.
 */
export default function TrashView({
  className = "",
}: TrashViewProps): JSX.Element {
  const projectId = useAppSelector((s) => selectActiveProjectDirectoryId(s));
  const dispatch = useAppDispatch();

  // FR-10/OQ-2: a delete made elsewhere (e.g. the resource tree, via
  // `page.tsx`'s `handleResourceAction` dispatching `removeResource`) doesn't
  // touch this view's own local `resources`/`folders` state, so without this
  // the Trash listing wouldn't show the newly-trashed item until the writer
  // left and returned to the tab. `resources.length + folders.length` is a
  // cheap derived value that changes on every `resourcesSlice` add/remove
  // (including a folder's cascaded descendants) — the effect below refetches
  // `listTrash` when it changes, not on every render.
  const resourcesSliceCount = useAppSelector(
    (s) => s.resources.resources.length + s.resources.folders.length,
  );

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
  const [restoreNotices, setRestoreNotices] = useState<RestoreNotice[]>([]);

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
    // `resourcesSliceCount` is included so a `resourcesSlice` add/remove
    // made elsewhere (FR-10/OQ-2) refetches the Trash listing while this
    // view stays mounted, in addition to the existing mount/`projectId`-
    // change refetch `refetch`'s own identity already covers.
  }, [refetch, resourcesSliceCount]);

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
    setRestoreNotices([]);
    setPendingAction({ kind: "restore", ids: Array.from(selectedIds) });
  }, [selectedIds]);

  const openDeleteSelectedDialog = useCallback(() => {
    if (selectedIds.size === 0) return;
    setReport(null);
    setActionError(null);
    setRestoreNotices([]);
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
    setRestoreNotices([]);
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

    // Snapshotted before the request fires, so the notices built below can
    // still name an item after it's been filtered out of `resources`/
    // `folders` on success.
    const namesById = new Map<string, string>();
    resources.forEach((r) => namesById.set(r.id, r.originalName));
    folders.forEach((f) => namesById.set(f.id, f.originalName));

    const request =
      action.kind === "restore"
        ? restoreTrashItems(projectId, action.ids)
        : purgeTrashItems(projectId, action.ids);

    void request
      .then(async (results) => {
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
        setRestoreNotices(
          action.kind === "restore"
            ? buildRestoreNotices(results as RestoreItemResult[], namesById)
            : [],
        );
        setPendingAction(null);

        // A successful restore may have brought back an arbitrarily deep
        // cascade of descendants (a restored folder's whole subtree) that
        // `RestoreItemResult` doesn't itself describe in full, so rather
        // than reconstruct the added tree nodes from the batch result,
        // refetch the project's current resources/folders — the same
        // `openProject`-shaped data `app/(app)/page.tsx`'s `handleOpen`
        // dispatches via `loadResources`/`setFolders` — and dispatch that
        // pair here too, so the sidebar resource tree reflects the restore
        // without a reload.
        if (action.kind === "restore" && succeededCount > 0) {
          try {
            const opened = await openProject(projectId);
            dispatch(loadResources({ resources: opened.resources, projectId }));
            dispatch(setProjectFolders(opened.folders));
          } catch {
            // Best-effort: the restore itself already succeeded and is
            // reported via `report` above; a failed refetch here only means
            // the sidebar tree needs a manual reload to catch up, same as
            // before this fix.
          }
        }
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
  }, [pendingAction, projectId, isSubmitting, resources, folders, dispatch]);

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

      {/* Task 18 (FR-5/FR-9/FR-14): one distinct notice per relocation,
          rename, or unrelinked-reference outcome a restore batch produced —
          kept separate from `report`'s generic count above rather than
          folded into it, since each names a specific item and a specific
          reason, not a tally. Lives outside the `!isEmpty` gate for the same
          reason `report` does (see above).

          Task 19 Part B: `role="status"` lives on the inner `<span>`, not the
          `<li>` itself — `status` isn't an ARIA-allowed role for `<li>`
          (axe's `aria-allowed-role`), and overriding an `<li>`'s implicit
          `listitem` role away from `listitem` also breaks `<ul>`'s
          direct-children contract (axe's `list`). The `<span>` still carries
          the full notice text, so `getByRole("status")` finds the same
          accessible content as before. */}
      {restoreNotices.length > 0 && (
        <ul data-testid="trash-restore-notices">
          {restoreNotices.map((notice, index) => (
            <li
              key={`${notice.id}-${notice.kind}-${index}`}
              data-testid="trash-restore-notice"
              data-trash-restore-notice-kind={notice.kind}
            >
              <span role="status">{notice.text}</span>
            </li>
          ))}
        </ul>
      )}

      {isEmpty && <p data-testid="trash-empty-state">Trash is empty.</p>}

      {!isLoading && !error && !isEmpty && (
        <>
          <div
            role="status"
            aria-live="polite"
            className="sr-only"
            data-testid="trash-selection-count"
          >
            {selectedIds.size} of {allTopLevelIds.length} item
            {allTopLevelIds.length === 1 ? "" : "s"} selected
          </div>
          <div data-testid="trash-batch-toolbar" className="flex gap-2 mb-2">
            <Button
              variant="outline"
              size="sm"
              data-testid="trash-restore-selected"
              onClick={openRestoreSelectedDialog}
              disabled={selectedIds.size === 0 || isSubmitting}
            >
              Restore selected
            </Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="trash-delete-selected"
              onClick={openDeleteSelectedDialog}
              disabled={selectedIds.size === 0 || isSubmitting}
            >
              Delete selected permanently
            </Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="trash-empty-trash"
              onClick={openEmptyTrashDialog}
              disabled={isSubmitting}
            >
              Empty trash
            </Button>
          </div>

          {/* Task 19 Part B: this list previously carried `role="listbox"`/
              `aria-multiselectable` on the `<ul>` and `role="option"`/
              `aria-selected` on each row, layered on top of the native
              `<input type="checkbox">` already inside each row. That
              combination is an invalid ARIA pattern — a listbox `option`
              must not contain a focusable descendant, and axe's
              `nested-interactive` rule flags exactly that (a real,
              independently-focusable checkbox nested inside an element with
              an interactive `option` role). The multi-select state doesn't
              need a redundant listbox/option layer to be exposed to
              assistive tech: each row's own `<input type="checkbox">`
              already exposes checked/unchecked natively, and the
              `trash-selection-count` live region below announces the
              running total — both untouched by this change. Dropping the
              listbox/option roles also resolves axe's `list` rule (a `<ul>`
              with a `role` override elsewhere in this file previously took
              its children out of the plain listitem contract). */}
          <ul data-testid="trash-list" aria-label="Trash items">
            {resources.map((resource) => (
              <li
                key={resource.id}
                data-testid="trash-row"
                data-trash-kind="resource"
                data-trash-id={resource.id}
                data-trash-selected={selectedIds.has(resource.id)}
                className="workarea-list-item !cursor-default flex-col !items-stretch gap-2 mb-2"
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    className="w-[13px] h-[13px] flex-shrink-0"
                    data-testid="trash-row-select"
                    aria-label={`Select ${resource.originalName}`}
                    checked={selectedIds.has(resource.id)}
                    onChange={() => toggleSelected(resource.id)}
                  />
                  <div
                    data-testid="trash-row-label"
                    className="workarea-list-item-label flex-1 min-w-0 truncate"
                  >
                    {resource.originalName}
                  </div>
                  <div data-testid="trash-row-actions" />
                </div>
              </li>
            ))}

            {folders.map((folder) => (
              <li
                key={folder.id}
                data-testid="trash-row"
                data-trash-kind="folder"
                data-trash-id={folder.id}
                data-trash-selected={selectedIds.has(folder.id)}
                className="workarea-list-item !cursor-default flex-col !items-stretch gap-2 mb-2"
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    className="w-[13px] h-[13px] flex-shrink-0"
                    data-testid="trash-row-select"
                    aria-label={`Select ${folder.originalName}`}
                    checked={selectedIds.has(folder.id)}
                    onChange={() => toggleSelected(folder.id)}
                  />
                  <div
                    data-testid="trash-row-label"
                    className="workarea-list-item-label flex-1 min-w-0 truncate"
                  >
                    {folder.originalName}
                  </div>
                  <div data-testid="trash-row-actions" />
                </div>

                {folder.descendants.length > 0 && (
                  <ul
                    data-testid="trash-nested-list"
                    className="flex flex-col gap-1 pl-6"
                  >
                    {folder.descendants.map((descendant) => (
                      <li
                        key={descendant.id}
                        data-testid="trash-nested-row"
                        data-trash-kind={descendant.kind}
                        data-trash-id={descendant.id}
                        className="workarea-list-item-meta"
                      >
                        {/* Nested descendants are read-only: no restore/purge
                            control of their own, and — unlike a top-level
                            row above — no `trash-row-actions` slot at all, so
                            no select checkbox or actions can be wired in
                            here. Task 6's manifest entry itself carries no
                            name, only kind + id — `name` here is resolved
                            server-side by `listTrashedItems` (Task 24,
                            Finding 4) from the descendant's trashed sidecar
                            (resource) or moved `folder.json` descriptor
                            (folder), so this renders "resource: <name>" /
                            "folder: <name>" rather than a raw id. */}
                        {descendant.kind}: {descendant.name}
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
