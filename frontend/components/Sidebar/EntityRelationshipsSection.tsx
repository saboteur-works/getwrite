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
} from "../../src/lib/api/entity-relationships";
import type { EntityRelationshipEdge } from "../../src/lib/api/entity-relationships";
import LabeledField from "./controls/LabeledField";
import Button from "../common/UI/Button/Button";

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
 * Renders only the FR-2 create control in this task (Task 6). Task 7 will
 * extend this same file to render the fetched edge list itself, with
 * removal and the FR-11 dangling-edge placeholder — the `edges`/`isLoading`
 * state and the `refetch` callback below are already shaped for that.
 *
 * Reachable only when rendered from the same sidebar location
 * `EntitySection.tsx` is already gated on the `entities` feature flag
 * (`MetadataSidebar.tsx`) — this component invents no flag check of its
 * own (FR-10).
 */
export default function EntityRelationshipsSection(): JSX.Element | null {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
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
  }, [refetch]);

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

      {/* Task 7 extends this component with the fetched `edges` list
          (removal + the FR-11 dangling-edge placeholder). */}
    </div>
  );
}
