"use client";

import { useState } from "react";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { selectResource, updateResource } from "../../src/store/resourcesSlice";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import { updateSidecar } from "../../src/lib/api/resources";
import {
  listEntityRelationships,
  removeEntityRelationshipsForEntity,
} from "../../src/lib/api/entity-relationships";
import type { EntityRelationshipEdge } from "../../src/lib/api/entity-relationships";
import type { AnyResource } from "../../src/lib/models/types";
import { useEntityRelationshipsRefresh } from "./EntityRelationshipsRefreshContext";
import Button from "../common/UI/Button/Button";
import ConfirmDialog from "../common/ConfirmDialog";

/** `aria-label` of the Entity Kind input in `EntitySection.tsx` — the
 * focus target after a successful confirm (FR-19). Looked up imperatively
 * via the DOM rather than a ref, because `EntitySection` and
 * `RemoveEntityControl` are unrelated sibling components and, per FR-19,
 * this control itself unmounts as soon as `updateResource` dispatches
 * (`isEntity` goes false), while `EntitySection`'s Entity Kind field stays
 * mounted throughout. */
const ENTITY_KIND_INPUT_SELECTOR = '[aria-label="entity-kind-input"]';

/**
 * Clears both `entityKind` and `aliases` on `resource` for the client-side
 * Redux dispatch only (FR-4). `updateResource`'s reducer
 * (`store/resourcesSlice.ts`) merges partial updates with a shallow
 * `{ ...previous, ...update }` spread, which only overwrites keys that are
 * *present* on `update` — an omitted key leaves the previous value in place
 * — so both keys must be explicitly set to `undefined` here, not omitted.
 *
 * This is unrelated to what actually persists to disk: the sidecar write
 * uses `updateSidecar`'s `clearKeys` parameter (Task 10/11) instead, since
 * `JSON.stringify` silently drops `undefined`-valued keys before an HTTP
 * body ever reaches the server (Stage 6.5 measurement) — see
 * `withoutEntityFields` below, used for that call.
 */
function withEntityRemoved(resource: AnyResource): AnyResource {
  return { ...resource, entityKind: undefined, aliases: undefined };
}

/**
 * Returns a copy of `resource` with `entityKind` and `aliases` omitted
 * entirely (not set to `undefined`) — the shape `updateSidecar` expects for
 * its `updatedResource` argument when paired with
 * `clearKeys: ["entityKind", "aliases"]` (Task 10/11), since the actual
 * clearing is now performed server-side via `clearKeys`, not by relying on
 * an `undefined`-valued key surviving to the request body.
 */
function withoutEntityFields(resource: AnyResource): AnyResource {
  const { entityKind: _entityKind, aliases: _aliases, ...rest } = resource;
  return rest as AnyResource;
}

/**
 * Sidebar control for removing an entity's declared status
 * (`specs/features/remove-entity.md`, FR-2/FR-6/FR-7/FR-13/FR-17/FR-18).
 *
 * Gated on the identical `isEntity` condition `EntitySection.tsx` already
 * uses (`(resource.entityKind ?? "").trim().length > 0`) and nothing else —
 * no new feature flag (FR-2/FR-13). Renders nothing when that condition is
 * false.
 *
 * Opening the confirmation dialog issues a fresh, independent
 * `listEntityRelationships(projectId)` call (mirroring
 * `EntityRelationshipsSection.tsx`'s own self-contained fetch pattern rather
 * than reading that component's state, which exposes no edge count of its
 * own) and filters the result client-side to edges where the current entity
 * is `sourceEntityId` or `targetEntityId` (FR-17). While that fetch is
 * pending, the confirm control stays disabled and no checkbox or error is
 * shown. On success with at least one matching edge, a "keep vs. delete"
 * checkbox is offered, unchecked by default (FR-18); with zero matching
 * edges, no checkbox is shown at all (FR-7). On fetch failure, this control
 * fails closed toward *keeping* the relationships — no checkbox, an inline
 * error, and the confirm control left enabled so entity removal can still
 * proceed on the keep path (FR-17).
 *
 * On confirm (FR-1/FR-4/FR-11/FR-15/FR-16/FR-19), this control performs the
 * actual write sequence rather than `EntitySection.tsx`'s
 * optimistic-dispatch-then-swallow `persist()` pattern: when the writer
 * checked the delete-edges box, `removeEntityRelationshipsForEntity` is
 * awaited first, and only once it resolves does the sidecar write
 * (`updateSidecar`, clearing `entityKind`/`aliases`) run — never the
 * reverse order, never in parallel (OQ-1). While either call is pending,
 * `isConfirmDisabled` stays `true` and a repeat click is a no-op. Either
 * call failing leaves the dialog open with an inline error and no Redux
 * dispatch, so the writer can retry or cancel. Only once every necessary
 * call succeeds does the handler dispatch `updateResource`, call
 * `notifyRelationshipsChanged()` (only on the delete path), dispatch
 * `fetchEntityAliasTable`, close the dialog, and move focus to the Entity
 * Kind input — in that order, because dispatching `updateResource` flips
 * `isEntity` to `false` and unmounts this control immediately (FR-2), so
 * every step that depends on this component still being mounted runs
 * before that final dispatch.
 */
export default function RemoveEntityControl(): JSX.Element | null {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const resource = useAppSelector((state) => selectResource(state.resources));
  const dispatch = useAppDispatch();
  const { notifyRelationshipsChanged } = useEntityRelationshipsRefresh();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingEdges, setIsLoadingEdges] = useState(false);
  const [matchingEdges, setMatchingEdges] = useState<EntityRelationshipEdge[]>(
    [],
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shouldAlsoDeleteRelationships, setShouldAlsoDeleteRelationships] =
    useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEntity = (resource?.entityKind ?? "").trim().length > 0;

  if (!projectId || !resource || !isEntity) return null;

  const entityId = resource.id;

  const openDialog = (): void => {
    setIsDialogOpen(true);
    setLoadError(null);
    setSubmitError(null);
    setMatchingEdges([]);
    setShouldAlsoDeleteRelationships(false);
    setIsLoadingEdges(true);
    void listEntityRelationships(projectId)
      .then((edges) => {
        const filtered = edges.filter(
          (edge) =>
            edge.sourceEntityId === entityId ||
            edge.targetEntityId === entityId,
        );
        setMatchingEdges(filtered);
      })
      .catch(() => {
        // Fail closed toward keep (FR-17): no checkbox, an inline error, and
        // the confirm control stays enabled so removal can still proceed on
        // the keep path.
        setLoadError("Relationship data could not be loaded.");
      })
      .finally(() => {
        setIsLoadingEdges(false);
      });
  };

  const closeDialog = (): void => {
    setIsDialogOpen(false);
  };

  const edgeCount = matchingEdges.length;
  const hasEdges = !isLoadingEdges && !loadError && edgeCount > 0;
  const willDeleteEdges = hasEdges && shouldAlsoDeleteRelationships;

  /**
   * Performs the actual removal write sequence (FR-1/FR-4/FR-11/FR-15/
   * FR-16/FR-19). Guards against a repeat click while a previous call is
   * still in flight (FR-15): `isSubmitting` gates `isConfirmDisabled`
   * below, but this early-return is a second line of defense against a
   * click that lands before the disabled state re-renders.
   */
  const handleConfirm = (): void => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    void (async () => {
      try {
        // OQ-1's resolved ordering: when the writer chose to delete the
        // entity's authored edges, that call MUST run first and MUST
        // resolve before the sidecar write is attempted — never the
        // reverse, never in parallel. On the keep path (box unchecked, or
        // never shown because there were zero edges), no call is made at
        // all.
        if (willDeleteEdges) {
          await removeEntityRelationshipsForEntity(projectId, entityId);
        }

        const updated = withEntityRemoved(resource);
        await updateSidecar(
          entityId,
          projectId,
          withoutEntityFields(resource),
          ["entityKind", "aliases"],
        );

        // Success sequence (FR-19): every step below that depends on this
        // component still being mounted runs BEFORE the `updateResource`
        // dispatch, because that dispatch flips `isEntity` to `false` and
        // unmounts this control (and its `ConfirmDialog`) immediately.
        setIsDialogOpen(false);
        if (willDeleteEdges) {
          // Only the delete path changed anything `EntityRelationshipsSection`
          // shows — a keep-path success leaves its list untouched.
          notifyRelationshipsChanged();
        }
        dispatch(fetchEntityAliasTable(projectId));
        // Deferred to a macrotask: Radix's own `onCloseAutoFocus` (fired by
        // the dialog closing, above) asynchronously tries to return focus
        // to this control's now-unmounting "Remove Entity" trigger button,
        // which would otherwise win a same-tick race against this explicit
        // focus move. Running after that lets FR-19's explicit focus target
        // land last.
        window.setTimeout(() => {
          document
            .querySelector<HTMLElement>(ENTITY_KIND_INPUT_SELECTOR)
            ?.focus();
        }, 0);
        dispatch(updateResource(updated));
      } catch {
        // Either call failed (FR-15): keep the dialog open, show an inline
        // error, dispatch nothing, and let the writer retry or cancel.
        setSubmitError("Failed to remove entity. Please try again.");
        setIsSubmitting(false);
      }
    })();
  };

  const isConfirmDisabled = isLoadingEdges || isSubmitting;

  return (
    <div>
      <Button
        variant="destructive"
        onClick={openDialog}
        aria-label="remove-entity"
      >
        Remove Entity
      </Button>

      <ConfirmDialog
        isOpen={isDialogOpen}
        title="Remove entity"
        description="This will clear this resource's entity status. The resource itself is not deleted."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={closeDialog}
        isConfirmDisabled={isConfirmDisabled}
        details={
          loadError ? (
            <p className="text-gw-nano text-gw-secondary" role="alert">
              {loadError}
            </p>
          ) : (
            <>
              {hasEdges && (
                <label className="flex items-center gap-2 text-sm text-gw-primary">
                  <input
                    type="checkbox"
                    aria-label="also-delete-relationships"
                    checked={shouldAlsoDeleteRelationships}
                    onChange={(e) =>
                      setShouldAlsoDeleteRelationships(e.target.checked)
                    }
                  />
                  Also delete {edgeCount}{" "}
                  {edgeCount === 1 ? "relationship" : "relationships"} involving
                  this entity
                </label>
              )}
              {submitError && (
                <p className="text-gw-nano text-gw-secondary" role="alert">
                  {submitError}
                </p>
              )}
            </>
          )
        }
      />
    </div>
  );
}
