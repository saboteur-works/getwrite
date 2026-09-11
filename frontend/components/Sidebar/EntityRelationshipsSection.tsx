"use client";

import { useCallback, useEffect, useState } from "react";
import useAppSelector from "../../src/store/hooks";
import { selectResource } from "../../src/store/resourcesSlice";
import {
  selectActiveProjectDirectoryId,
  selectActiveProjectRelationshipTypes,
} from "../../src/store/projectsSlice";
import { selectEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import {
  createEntityRelationship,
  listEntityRelationships,
  removeEntityRelationship,
} from "../../src/lib/api/entity-relationships";
import type { EntityRelationshipEdge } from "../../src/lib/api/entity-relationships";
import LabeledField from "./controls/LabeledField";
import Button from "../common/UI/Button/Button";
import { useEntityRelationshipsRefresh } from "./EntityRelationshipsRefreshContext";

/**
 * Sidebar section for an entity's own view, authoring directed, typed
 * relationships to the project's other declared entities
 * (`specs/features/entity-relationships.md`, Task 6).
 *
 * This is a *separate, self-contained* surface from `EntitySection.tsx`
 * (aliases) and `EntityMentionsSection.tsx`/`EntityMentionsContext.tsx`
 * (detected mentions + explicit links). It deliberately does NOT join
 * `EntityMentionsContext.tsx`'s shared `getEntityMentionedIn` fetch: that
 * provider exists to share one read-only fetch between two consumers
 * (`EntityMentionsSection`/`EntityCompileSection`) and carries a different
 * data shape entirely — an authored edge is neither a Mention nor a
 * Backlink (see the feature spec's Overview). This component performs its
 * own independent `list(projectId)` fetch on mount and after every
 * create/remove, mirroring `EntitySection.tsx`'s own self-contained
 * fetch/state lifecycle for its alias control.
 *
 * Renders the FR-2 create control (Task 6) and, as of Task 7, the fetched
 * edge list itself: every edge naming the selected entity as either source
 * or target, the other entity's resolved name, a source/target direction
 * indicator (FR-3), a "Remove" control (FR-6) calling
 * {@link removeEntityRelationship} and re-fetching on success, and the
 * FR-11 dangling-edge placeholder when the other entity id is no longer in
 * the alias table (mirroring `mentions-core.ts`'s `resolveName`
 * fallback-to-raw-id floor). No edit-in-place of an existing row's type or
 * endpoints (OQ-3).
 *
 * Reachable only when rendered from the same sidebar location
 * `EntitySection.tsx` is already gated on the `entities` feature flag
 * (`MetadataSidebar.tsx`) — this component invents no flag check of its
 * own (FR-10).
 *
 * The refetch also runs on a bump to `EntityRelationshipsRefreshContext`'s
 * `refreshToken` (FR-16), so a mutation elsewhere in the sidebar — e.g. an
 * entity removal — can invalidate a stale relationship list without this
 * component remounting or its `projectId` changing. That context only
 * signals; it fetches nothing itself, so this remains the same independent
 * `list(projectId)` fetch described above, just with an added trigger.
 */
export default function EntityRelationshipsSection(): JSX.Element | null {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const { refreshToken } = useEntityRelationshipsRefresh();
  const resource = useAppSelector((state) => selectResource(state.resources));
  const aliasTable = useAppSelector(selectEntityAliasTable);
  const relationshipTypes = useAppSelector(
    selectActiveProjectRelationshipTypes,
  );

  const [edges, setEdges] = useState<EntityRelationshipEdge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [targetEntityId, setTargetEntityId] = useState("");
  const [relationshipType, setRelationshipType] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingEdgeId, setRemovingEdgeId] = useState<string | null>(null);

  const entityId = resource?.id;

  const refetch = useCallback(() => {
    if (!projectId) {
      setEdges([]);
      return;
    }
    setIsLoading(true);
    void listEntityRelationships(projectId)
      .then((result) => setEdges(result))
      .finally(() => setIsLoading(false));
  }, [projectId]);

  useEffect(() => {
    refetch();
    // refreshToken is not read by refetch itself — it is a pure trigger
    // (FR-16) that re-runs the identical projectId-scoped fetch above.
  }, [refetch, refreshToken]);

  // Every other declared entity, excluding the currently-selected one
  // (FR-4 client-side defense-in-depth — the same-entity option is never
  // offered in the first place, in addition to Task 2's server-side
  // rejection).
  const otherEntities = Object.values(aliasTable.entities).filter(
    (entry) => entry.entityId !== entityId,
  );

  useEffect(() => {
    if (
      targetEntityId &&
      !otherEntities.some((e) => e.entityId === targetEntityId)
    ) {
      setTargetEntityId("");
    }
    // Only re-validate when the candidate list changes; targetEntityId is
    // read, not depended on, to avoid clearing a value the user just chose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherEntities]);

  useEffect(() => {
    if (relationshipType && !relationshipTypes.includes(relationshipType)) {
      setRelationshipType("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationshipTypes]);

  if (!projectId || !entityId) return null;

  const hasRelationshipTypes = relationshipTypes.length > 0;
  const canSubmit =
    hasRelationshipTypes &&
    targetEntityId.length > 0 &&
    relationshipType.length > 0 &&
    !isSubmitting;

  const handleAdd = (): void => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    void createEntityRelationship(
      projectId,
      entityId,
      targetEntityId,
      relationshipType,
    )
      .then((created) => {
        if (!created) {
          setError("Could not create the relationship.");
          return;
        }
        refetch();
      })
      .finally(() => setIsSubmitting(false));
  };

  const handleRemove = (edgeId: string): void => {
    setRemovingEdgeId(edgeId);
    void removeEntityRelationship(projectId, edgeId)
      .then(() => refetch())
      .finally(() => setRemovingEdgeId(null));
  };

  return (
    <div className="flex flex-col gap-3" data-edge-count={edges.length}>
      <LabeledField label="Related entity">
        <select
          aria-label="entity-relationship-target-select"
          className="w-full mt-2 p-2 border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50"
          value={targetEntityId}
          onChange={(e) => setTargetEntityId(e.target.value)}
          disabled={otherEntities.length === 0}
        >
          <option value="">Choose an entity&hellip;</option>
          {otherEntities.map((entry) => (
            <option key={entry.entityId} value={entry.entityId}>
              {entry.name}
            </option>
          ))}
        </select>
        {otherEntities.length === 0 && (
          <p className="text-gw-nano text-gw-secondary mt-1">
            No other declared entities yet.
          </p>
        )}
      </LabeledField>

      <LabeledField label="Relationship type">
        <select
          aria-label="entity-relationship-type-select"
          className="w-full mt-2 p-2 border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50"
          value={relationshipType}
          onChange={(e) => setRelationshipType(e.target.value)}
          disabled={!hasRelationshipTypes}
        >
          <option value="">Choose a type&hellip;</option>
          {relationshipTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        {!hasRelationshipTypes && (
          <p className="text-gw-nano text-gw-secondary mt-1">
            No relationship types are configured for this project.
          </p>
        )}
      </LabeledField>

      <div>
        <Button
          variant="secondary"
          onClick={handleAdd}
          disabled={!canSubmit}
          aria-label="add-entity-relationship"
        >
          Add
        </Button>
        {error && (
          <p className="text-gw-nano text-gw-secondary mt-1" role="alert">
            {error}
          </p>
        )}
      </div>

      {isLoading && (
        <p className="text-gw-nano text-gw-secondary" role="status">
          Loading relationships&hellip;
        </p>
      )}

      {!isLoading && edges.length > 0 && (
        <ul
          aria-label="entity-relationship-list"
          className="flex flex-col gap-2"
        >
          {edges.map((edge) => {
            const isSource = edge.sourceEntityId === entityId;
            const otherEntityId = isSource
              ? edge.targetEntityId
              : edge.sourceEntityId;
            const otherEntity = aliasTable.entities[otherEntityId];
            // FR-11: an entity soft-deleted after the edge was created is no
            // longer in the alias table. Render a placeholder in place of
            // its name rather than hiding, filtering, or crashing —
            // mirroring `mentions-core.ts`'s `resolveName` fallback-to-
            // raw-id floor.
            const otherEntityName = otherEntity?.name ?? "Unknown entity";
            const directionLabel = isSource
              ? "is a source of"
              : "is a target of";

            return (
              <li
                key={edge.id}
                className="flex items-center justify-between gap-2 text-sm text-gw-primary"
                data-edge-role={isSource ? "source" : "target"}
              >
                <span>
                  {directionLabel} <strong>{otherEntityName}</strong> &mdash;{" "}
                  {edge.relationshipType}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => handleRemove(edge.id)}
                  disabled={removingEdgeId === edge.id}
                  aria-label={`Remove relationship with ${otherEntityName}`}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
