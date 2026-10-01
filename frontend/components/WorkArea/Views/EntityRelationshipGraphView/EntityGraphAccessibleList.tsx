import React from "react";
import useAppSelector from "../../../../src/store/hooks";
import {
  selectActiveProjectDirectoryId,
  selectActiveProjectMetadataSchema,
} from "../../../../src/store/projectsSlice";
import { listTags } from "../../../../src/lib/api/tags";
import type { Tag } from "../../../../src/lib/models/types";
import type {
  EntityGraphEdge,
  EntityGraphNode,
} from "./EntityRelationshipGraphView";
import {
  describeAuthoredEdge,
  describeBacklinkEdge,
  describeCooccurrenceEdge,
  describeProximityMentionEdge,
  describeSharedMetadataEdge,
} from "./edgeDescriptions";

export interface EntityGraphAccessibleListProps {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
  /**
   * Invoked when a node's button is activated — pointer click, or a native
   * `<button>`'s built-in Enter/Space keyboard activation (FR-9). Called
   * with that node's `entityId`.
   */
  onNodeActivated?: (entityId: string) => void;
}

/**
 * Sorts nodes alphabetically by name, case-insensitive (OQ-7), regardless
 * of input order. Ties (identical names, case-insensitively) fall back to
 * `entityId` so the sort is stable and deterministic.
 */
function sortNodesByName(nodes: EntityGraphNode[]): EntityGraphNode[] {
  return [...nodes].sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    if (nameCompare !== 0) return nameCompare;
    return a.entityId.localeCompare(b.entityId);
  });
}

/**
 * `EntityGraphAccessibleList` is the FR-11 synchronized accessible list: a
 * semantic node list (a `<ul>` of `<li>`-wrapped native
 * `<button type="button">` per entity, mirroring `EntityRosterRow.tsx:70-136`)
 * plus a semantic, non-interactive edge list disclosing each edge's kind,
 * direction/type, and — for a co-occurrence edge — its shared-resource
 * count (FR-12) as literal text.
 *
 * Rendered by `EntityRelationshipGraphView.tsx` alongside `EntityGraphCanvas`,
 * from the same node and edge data, so the two stay in step. It takes that
 * node/edge data as props and does no fetching of its own for most of it,
 * which is what lets most of its tests drive it directly from fixtures — the
 * one exception (Task 9) is the active project's tag list and metadata
 * schema, read directly via Redux/`listTags` to resolve a `sharedMetadata`
 * edge's raw `sharedTagIds`/`sharedFieldKeys` to display labels before
 * handing them to `describeSharedMetadataEdge`, since that data isn't
 * threaded through `EntityGraphEdge` itself.
 *
 * The list is visually hidden (`sr-only`), not removed: it is FR-10's
 * designated accessibility mechanism — "MUST be satisfied by the synchronized
 * accessible list specified in FR-11" — so it has to stay in the
 * accessibility tree and keyboard tab order while the canvas beside it
 * carries the visual reading. `sr-only` clips it; `hidden` or `display: none`
 * would look like the same change and silently delete the graph's only
 * screen-reader surface.
 *
 * It shipped unstyled and therefore visible, which rendered every node name
 * and edge description as raw text under the canvas. FR-11's wording ("render,
 * alongside the canvas, a synchronized semantic list") does not say whether
 * the list should be seen; `sr-only` is the resolution of that ambiguity, and
 * follows the same convention `EntityRosterRow.tsx:133` uses.
 */
export default function EntityGraphAccessibleList({
  nodes,
  edges,
  onNodeActivated,
}: EntityGraphAccessibleListProps): JSX.Element {
  const nameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      map.set(node.entityId, node.name);
    }
    return map;
  }, [nodes]);

  const sortedNodes = React.useMemo(() => sortNodesByName(nodes), [nodes]);

  // Task 9: `EntityGraphSharedMetadataGraphEdge` (Task 7, `EntityRelationshipGraphView.tsx`)
  // still carries raw `sharedTagIds`/`sharedFieldKeys`, not display labels —
  // confirmed directly against that file and against `EntityGraphCanvas.tsx`'s
  // own "Task 8/9's scope" doc comment at its `sharedMetadata` case. Since
  // `describeSharedMetadataEdge` (`edgeDescriptions.ts`) expects
  // already-resolved label strings, this component resolves them itself
  // rather than rendering raw ids as user-facing text. It reads the active
  // project's tag list and metadata schema directly (the same
  // `selectActiveProjectDirectoryId`/`listTags` pattern `TagsSection.tsx` and
  // `EntityRelationshipGraphView.tsx` already use) rather than taking them as
  // props, since this task's scope excludes changing
  // `EntityRelationshipGraphView.tsx`'s own props/wiring.
  const projectId = useAppSelector((s) => selectActiveProjectDirectoryId(s));
  const metadataSchema = useAppSelector((s) =>
    selectActiveProjectMetadataSchema(s),
  );

  const fieldLabelByKey = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const group of metadataSchema.groups) {
      for (const field of group.fields) {
        map.set(field.key, field.label);
      }
    }
    return map;
  }, [metadataSchema]);

  const [tags, setTags] = React.useState<Tag[]>([]);

  React.useEffect(() => {
    if (!projectId) {
      setTags([]);
      return;
    }
    let isCancelled = false;
    // `listTags` only degrades to `[]` for a non-ok HTTP response — a thrown
    // network/fetch error propagates uncaught (`tags.ts`'s existing
    // contract), so this `.catch()` is required, mirroring
    // `TagsSection.tsx`'s identical `listTags(...).then(...).catch(...)`
    // pattern, not optional defensiveness.
    void listTags(projectId)
      .then((result) => {
        if (!isCancelled) setTags(result);
      })
      .catch(() => {
        if (!isCancelled) setTags([]);
      });
    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  const tagLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const tag of tags) {
      map.set(tag.id, tag.name);
    }
    return map;
  }, [tags]);

  /**
   * Resolves a shared-metadata edge's raw tag ids / field keys to display
   * labels, falling back to the raw id/key itself when it names a tag or
   * field no longer in the project's current tag list / metadata schema
   * (e.g. deleted since the edge was computed) — degraded but still legible,
   * mirroring `resolveEntityName`'s "Unknown entity" fallback precedent of
   * never throwing on a stale reference.
   */
  const resolveSharedMetadataLabels = React.useCallback(
    (
      sharedTagIds: string[],
      sharedFieldKeys: string[],
    ): { sharedTagLabels: string[]; sharedFieldLabels: string[] } => ({
      sharedTagLabels: sharedTagIds.map((id) => tagLabelById.get(id) ?? id),
      sharedFieldLabels: sharedFieldKeys.map(
        (key) => fieldLabelByKey.get(key) ?? key,
      ),
    }),
    [tagLabelById, fieldLabelByKey],
  );

  return (
    <div className="sr-only" data-testid="entity-graph-accessible-list">
      <ul aria-label="Entity nodes" data-testid="entity-graph-node-list">
        {sortedNodes.map((node) => (
          <li key={node.entityId} data-testid="entity-graph-node-item">
            <button
              type="button"
              onClick={() => onNodeActivated?.(node.entityId)}
            >
              {node.name}
            </button>
          </li>
        ))}
      </ul>
      <ul aria-label="Entity edges" data-testid="entity-graph-edge-list">
        {edges.map((edge) => {
          // Exhaustive per-kind rendering (Feature 68, Task 7 minimal fix,
          // extended by Task 9): a non-exhaustive version here previously
          // fell through to the `authored`-shaped branch for any unhandled
          // kind, which would read `.id`/`.sourceEntityId`/`.targetEntityId`
          // off an edge that doesn't have them and mis-describe it as
          // authored. Every kind below renders via Task 5's own description
          // functions, so the canvas tooltip and this list's text can never
          // drift apart for any edge kind (FR-6).
          switch (edge.kind) {
            case "cooccurrence":
              return (
                <li
                  key={`cooccurrence-${edge.entityIdA}-${edge.entityIdB}`}
                  data-testid="entity-graph-edge-item"
                >
                  {describeCooccurrenceEdge(
                    nameById,
                    edge.entityIdA,
                    edge.entityIdB,
                    edge.sharedResourceCount,
                  )}
                </li>
              );
            case "authored":
              return (
                <li
                  key={`authored-${edge.id}`}
                  data-testid="entity-graph-edge-item"
                >
                  {describeAuthoredEdge(
                    nameById,
                    edge.sourceEntityId,
                    edge.targetEntityId,
                    edge.relationshipType,
                  )}
                </li>
              );
            case "backlinks":
              return (
                <li
                  key={`backlinks-${edge.entityIds[0]}-${edge.entityIds[1]}`}
                  data-testid="entity-graph-edge-item"
                >
                  {describeBacklinkEdge(
                    nameById,
                    edge.entityIds[0],
                    edge.entityIds[1],
                  )}
                </li>
              );
            case "proximityMentions":
              return (
                <li
                  key={`proximityMentions-${edge.entityIdA}-${edge.entityIdB}-${edge.resourceId}`}
                  data-testid="entity-graph-edge-item"
                >
                  {describeProximityMentionEdge(
                    nameById,
                    edge.entityIdA,
                    edge.entityIdB,
                    edge.weight,
                  )}
                </li>
              );
            case "sharedMetadata": {
              const { sharedTagLabels, sharedFieldLabels } =
                resolveSharedMetadataLabels(
                  edge.sharedTagIds,
                  edge.sharedFieldKeys,
                );
              return (
                <li
                  key={`sharedMetadata-${edge.entityIdA}-${edge.entityIdB}`}
                  data-testid="entity-graph-edge-item"
                >
                  {describeSharedMetadataEdge(
                    nameById,
                    edge.entityIdA,
                    edge.entityIdB,
                    sharedTagLabels,
                    sharedFieldLabels,
                  )}
                </li>
              );
            }
          }
        })}
      </ul>
    </div>
  );
}
