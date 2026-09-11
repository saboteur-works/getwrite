"use client";

import { useState } from "react";
import useAppSelector from "../../src/store/hooks";
import { selectResource } from "../../src/store/resourcesSlice";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { listEntityRelationships } from "../../src/lib/api/entity-relationships";
import type { EntityRelationshipEdge } from "../../src/lib/api/entity-relationships";
import Button from "../common/UI/Button/Button";
import ConfirmDialog from "../common/ConfirmDialog";

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
 * This component stops at dialog presentation: `onConfirm` is a stub for
 * this task. The actual write — clearing `entityKind`/`aliases` and,
 * conditionally, calling `removeEntityRelationshipsForEntity` — is Task 7's
 * scope entirely.
 */
export default function RemoveEntityControl(): JSX.Element | null {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const resource = useAppSelector((state) => selectResource(state.resources));

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingEdges, setIsLoadingEdges] = useState(false);
  const [matchingEdges, setMatchingEdges] = useState<EntityRelationshipEdge[]>(
    [],
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shouldAlsoDeleteRelationships, setShouldAlsoDeleteRelationships] =
    useState(false);

  const isEntity = (resource?.entityKind ?? "").trim().length > 0;

  if (!projectId || !resource || !isEntity) return null;

  const entityId = resource.id;

  const openDialog = (): void => {
    setIsDialogOpen(true);
    setLoadError(null);
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

  const handleConfirm = (): void => {
    // Stub for this task — the write (clearing entityKind/aliases and, when
    // shouldAlsoDeleteRelationships is checked, removing the entity's relationship
    // edges) is Task 7's scope.
    closeDialog();
  };

  const edgeCount = matchingEdges.length;
  const hasEdges = !isLoadingEdges && !loadError && edgeCount > 0;
  const isConfirmDisabled = isLoadingEdges;

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
          ) : hasEdges ? (
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
          ) : null
        }
      />
    </div>
  );
}
