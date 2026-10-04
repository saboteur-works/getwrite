import React from "react";
import { shallowEqual } from "react-redux";
import useAppSelector from "../../../../src/store/hooks";
import {
  selectEntityAliasTable,
  type EntityAliasTableState,
} from "../../../../src/store/entityAliasTableSlice";
import {
  selectActiveProjectDirectoryId,
  selectIsFeatureEnabled,
} from "../../../../src/store/projectsSlice";
import {
  getEntityCooccurrence,
  type EntityCooccurrenceEntry,
} from "../../../../src/lib/api/entity-cooccurrence";
import {
  listEntityRelationships,
  type EntityRelationshipEdge,
} from "../../../../src/lib/api/entity-relationships";
import {
  getEntityGraphSettings,
  type EntityGraphSettings,
} from "../../../../src/lib/api/entity-graph-settings";
import {
  getEntityBacklinkEdges,
  type EntityBacklinkEdge,
} from "../../../../src/lib/api/entity-backlink-edges";
import {
  getProximityMentionEdges,
  type ProximityMentionEdge,
} from "../../../../src/lib/api/entity-proximity-mention-edges";
import {
  getEntitySharedMetadataEdges,
  type SharedMetadataEdge,
} from "../../../../src/lib/api/entity-shared-metadata-edges";
import {
  getEntityGraphKindStyles,
  type EntityGraphKindStyleRecord,
} from "../../../../src/lib/api/entity-graph-kind-styles";
import {
  DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES,
  filterToKnownConnectionTypes,
} from "../../../../src/lib/models/entity-graph-connection-types";
import type { EntityAliasEntry } from "../../../../src/lib/models/entity-alias-table";
import EntityGraphCanvas from "./EntityGraphCanvas";
import EntityGraphAccessibleList from "./EntityGraphAccessibleList";
import EntityKindStylesModal from "./EntityKindStylesModal";
import Button from "../../../common/UI/Button";

export interface EntityRelationshipGraphViewProps {
  /** Optional className for the outer container. */
  className?: string;
  /**
   * Invoked with an entity's `entityId` when a node is activated in either
   * the canvas or the accessible list (pointer click, or Enter/Space) —
   * FR-9. The caller (`AppShell.tsx`) owns both the Redux dispatch of
   * `setSelectedResourceId` and the work-area view switch back to `"edit"`,
   * mirroring `EntityRosterView`'s `onEntityActivated` pattern. This view
   * never writes to the sidecar itself.
   */
  onEntityActivated?: (entityId: string) => void;
}

/**
 * One node in the assembled graph: a declared entity, labelled with its
 * name (FR-3). Every entity in the alias table becomes a node regardless of
 * whether it has any edge, so isolated entities remain visible.
 */
export interface EntityGraphNode {
  entityId: string;
  name: string;
  entityKind: string;
}

/**
 * An unordered co-occurrence edge between two entities (FR-4/FR-7), reduced
 * from the co-occurrence map's two-directions-per-pair redundancy to exactly
 * one record per unordered pair. `entityIdA`/`entityIdB` carry no ordering
 * meaning of their own beyond "the pair" — the edge is undirected.
 */
export interface EntityGraphCooccurrenceEdge {
  kind: "cooccurrence";
  entityIdA: string;
  entityIdB: string;
  sharedResourceCount: number;
}

/**
 * A directed, typed authored-relationship edge (FR-4/FR-7), carried through
 * unchanged from `listEntityRelationships` — one record per input record,
 * no merging and no synthesized inverse.
 */
export interface EntityGraphAuthoredEdge {
  kind: "authored";
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
}

/**
 * An undirected derived edge between two declared entities whose underlying
 * resources are linked by an explicit backlink in either direction (Feature
 * 68, FR-3, Task 2/Task 7). Carries no weight or direction of its own —
 * `getEntityBacklinkEdges` (`backlinks.ts`) already collapses a bidirectional
 * backlink into one unordered pair.
 */
export interface EntityGraphBacklinkGraphEdge {
  kind: "backlinks";
  entityIds: [string, string];
}

/**
 * A weighted derived edge between two declared entities mentioned alongside
 * each other in one shared resource (Feature 68, FR-4, Task 3/Task 7).
 * `weight` is a raw average character-offset distance — a *smaller* number
 * means a *closer*, stronger connection. A pair sharing more than one
 * resource produces one of these edges per shared resource, not one edge
 * total, mirroring `getProximityMentionEdges`'s own per-resource shape.
 */
export interface EntityGraphProximityMentionGraphEdge {
  kind: "proximityMentions";
  entityIdA: string;
  entityIdB: string;
  resourceId: string;
  weight: number;
}

/**
 * An undirected derived edge between two declared entities sharing at least
 * one tag or one identical custom metadata field value (Feature 68, FR-5,
 * Task 4/Task 7). `sharedTagIds`/`sharedFieldKeys` list everything shared;
 * at least one is always non-empty.
 */
export interface EntityGraphSharedMetadataGraphEdge {
  kind: "sharedMetadata";
  entityIdA: string;
  entityIdB: string;
  sharedTagIds: string[];
  sharedFieldKeys: string[];
}

/**
 * The assembled edge list's element type. A co-occurrence edge and one or
 * more authored edges for the identical pair of entities are never merged
 * into a single record — they remain separate elements of this union
 * (FR-4/FR-5). The three Feature 68 Task 7 kinds below (`backlinks`,
 * `proximityMentions`, `sharedMetadata`) are likewise always separate
 * elements, never merged with each other or with a co-occurrence/authored
 * edge for the same pair.
 */
export type EntityGraphEdge =
  | EntityGraphCooccurrenceEdge
  | EntityGraphAuthoredEdge
  | EntityGraphBacklinkGraphEdge
  | EntityGraphProximityMentionGraphEdge
  | EntityGraphSharedMetadataGraphEdge;

/** The assembled node + edge data this view renders (data only, no layout). */
export interface EntityGraphData {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
}

/**
 * Builds the node list from the alias table (FR-3): one node per declared
 * entity, including ones with zero edges.
 */
function buildNodes(
  entities: Record<string, EntityAliasEntry>,
): EntityGraphNode[] {
  return Object.values(entities).map((entry) => ({
    entityId: entry.entityId,
    name: entry.name,
    entityKind: entry.entityKind,
  }));
}

/**
 * Collapses the co-occurrence map's two-directions-per-pair redundancy
 * (`result[a]` contains B's entry and `result[b]` contains A's mirrored
 * entry back) into exactly one undirected edge per unordered pair, keyed by
 * a canonical (sorted) pair key so each pair is only ever emitted once.
 */
function buildCooccurrenceEdges(
  cooccurrence: Record<string, EntityCooccurrenceEntry[]>,
): EntityGraphCooccurrenceEdge[] {
  const seenPairs = new Set<string>();
  const edges: EntityGraphCooccurrenceEdge[] = [];

  for (const [entityId, entries] of Object.entries(cooccurrence)) {
    for (const entry of entries) {
      const [entityIdA, entityIdB] = [entityId, entry.entityId].sort();
      const pairKey = `${entityIdA} ${entityIdB}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      edges.push({
        kind: "cooccurrence",
        entityIdA,
        entityIdB,
        sharedResourceCount: entry.count,
      });
    }
  }

  return edges;
}

/**
 * Carries every authored relationship edge through unchanged, one record
 * per input record — no deduplication, no merging, no synthesized inverse
 * (FR-4).
 */
function buildAuthoredEdges(
  relationships: EntityRelationshipEdge[],
): EntityGraphAuthoredEdge[] {
  return relationships.map((edge) => ({
    kind: "authored",
    id: edge.id,
    sourceEntityId: edge.sourceEntityId,
    targetEntityId: edge.targetEntityId,
    relationshipType: edge.relationshipType,
  }));
}

/**
 * Carries every derived backlink edge through unchanged, one record per
 * input record (Feature 68, Task 7).
 */
function buildBacklinkEdges(
  edges: EntityBacklinkEdge[],
): EntityGraphBacklinkGraphEdge[] {
  return edges.map((edge) => ({
    kind: "backlinks",
    entityIds: edge.entityIds,
  }));
}

/**
 * Collapses `getProximityMentionEdges`'s two-directions-per-pair redundancy
 * (mirroring `buildCooccurrenceEdges`'s precedent) into one edge per
 * unordered pair *per shared resource* — a pair sharing two resources still
 * produces two edges, since `ProximityMentionEdge.weight` is itself
 * resource-scoped (Feature 68, Task 7, FR-4).
 */
function buildProximityMentionGraphEdges(
  proximityMentions: Record<string, ProximityMentionEdge[]>,
): EntityGraphProximityMentionGraphEdge[] {
  const seenPairs = new Set<string>();
  const edges: EntityGraphProximityMentionGraphEdge[] = [];

  for (const [entityId, entries] of Object.entries(proximityMentions)) {
    for (const entry of entries) {
      const [entityIdA, entityIdB] = [entityId, entry.entityId].sort();
      const pairKey = `${entityIdA} ${entityIdB} ${entry.resourceId}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      edges.push({
        kind: "proximityMentions",
        entityIdA,
        entityIdB,
        resourceId: entry.resourceId,
        weight: entry.weight,
      });
    }
  }

  return edges;
}

/**
 * Carries every derived shared-metadata edge through unchanged, one record
 * per input record (Feature 68, Task 7).
 */
function buildSharedMetadataGraphEdges(
  edges: SharedMetadataEdge[],
): EntityGraphSharedMetadataGraphEdge[] {
  return edges.map((edge) => ({
    kind: "sharedMetadata",
    entityIdA: edge.entityIdA,
    entityIdB: edge.entityIdB,
    sharedTagIds: edge.sharedTagIds,
    sharedFieldKeys: edge.sharedFieldKeys,
  }));
}

/**
 * `EntityRelationshipGraphView` is the project-level seventh Work Area view
 * (product spec FR-39). It assembles the graph's node and edge data from
 * three already-shipped, already-`createTransport`-collapsed reads — the
 * cached `EntityAliasTable` (`entityAliasTableSlice`, no new fetch),
 * `getEntityCooccurrence`, and `listEntityRelationships` — and renders that
 * one assembled `graphData` through two side-by-side views: the real SVG
 * `EntityGraphCanvas` and the real FR-11 `EntityGraphAccessibleList`. Both
 * are driven by the identical `graphData`, and both call the identical
 * `onEntityActivated` on node activation (Task 7) — there is no divergent
 * second navigation path between them. The FR-14 empty state is rendered
 * here since it is a data-assembly-level branch, not a rendering concern.
 */
export default function EntityRelationshipGraphView({
  className = "",
  onEntityActivated,
}: EntityRelationshipGraphViewProps): JSX.Element {
  const aliasTable = useAppSelector(
    (s): EntityAliasTableState["table"] => selectEntityAliasTable(s),
    shallowEqual,
  );
  const isEntitiesEnabled = useAppSelector((s) =>
    selectIsFeatureEnabled(s, "entities"),
  );
  // Directory basename, not `project.id` — matches `EntityRosterView`'s use
  // of `selectActiveProjectDirectoryId` for tenant-scoped API calls.
  const projectId = useAppSelector((s) => selectActiveProjectDirectoryId(s));

  const [cooccurrence, setCooccurrence] = React.useState<
    Record<string, EntityCooccurrenceEntry[]>
  >({});
  const [relationships, setRelationships] = React.useState<
    EntityRelationshipEdge[]
  >([]);
  // Feature 68, Task 7: the three new derived-edge reads, plus the project's
  // active connection-type list. All five data sources are fetched together,
  // unconditionally, regardless of which types are currently active — only
  // `graphData`'s own filtering below (not a new fetch) responds to toggling
  // a type on/off, per Task 7's "Done when" requirement.
  const [backlinkEdges, setBacklinkEdges] = React.useState<
    EntityBacklinkEdge[]
  >([]);
  const [proximityMentions, setProximityMentions] = React.useState<
    Record<string, ProximityMentionEdge[]>
  >({});
  const [sharedMetadataEdges, setSharedMetadataEdges] = React.useState<
    SharedMetadataEdge[]
  >([]);
  // Feature 69, Task 8: the project's persisted entity-kind color/shape
  // style mapping, fetched alongside this view's other project-scoped reads
  // and threaded straight through to `EntityGraphCanvas` as `kindStyles`.
  // Re-fetched whenever `projectId` changes, the same minimal seam Task 6/7's
  // customization modal is expected to trigger a refetch through once it
  // exists (e.g. by calling this same fetch again after a save) — this task
  // does not build that trigger itself, only makes sure the data path isn't
  // dead-ended (see this task's own "Report back" instructions).
  const [kindStyles, setKindStyles] = React.useState<
    EntityGraphKindStyleRecord[]
  >([]);
  const [connectionTypes, setConnectionTypes] = React.useState<string[]>(
    DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES,
  );
  // Feature 68, Task 16: the project's configured focal hop radius, read from
  // the same `getEntityGraphSettings` call this view already makes for
  // `connectionTypes` below — no new fetch is introduced. Defaults to `1`
  // (mirroring `EntityGraphCanvas.tsx`'s own `DEFAULT_FOCAL_HOP_RADIUS`)
  // until that read resolves or if it fails.
  const [focalHopRadius, setFocalHopRadius] = React.useState<number>(1);
  // Feature 68, Task 17: the focal point itself is lifted here (rather than
  // left as `EntityGraphCanvas`'s own internal state) so this view's
  // accessible-list header "Clear focal point" control, and each node's new
  // "Set as focal point" control, can drive the identical state the canvas
  // renders from — see Task 15's handback report, which named this exact
  // mechanism. Both `EntityGraphCanvas` and `EntityGraphAccessibleList`
  // receive this same `focalEntityId` value below, so setting it from either
  // surface updates both.
  const [focalEntityId, setFocalEntityId] = React.useState<string | null>(null);
  // Feature 69, Task 7: the kind-style customization modal's own open/closed
  // state. The modal is gated behind the `entities` flag at its one entry
  // point below (the button), not inside the modal itself.
  const [isKindStylesModalOpen, setIsKindStylesModalOpen] =
    React.useState(false);

  // Re-fetches the persisted kind-style mapping (the same read the mount
  // effect below performs) so the canvas picks up a save made in
  // `EntityKindStylesModal` without a reload (FR-4). Extracted to its own
  // callback so both the mount effect and the modal's `onStylesChanged`
  // callback can trigger it without duplicating the fetch-or-degrade logic.
  const refetchKindStyles = React.useCallback(() => {
    if (!projectId) return;
    void getEntityGraphKindStyles(projectId)
      .then((result) => setKindStyles(result))
      .catch((err: unknown) => {
        console.error("Failed to load the entity-graph kind styles.", err);
        setKindStyles([]);
      });
  }, [projectId]);

  React.useEffect(() => {
    if (!projectId) {
      setCooccurrence({});
      setRelationships([]);
      setBacklinkEdges([]);
      setProximityMentions({});
      setSharedMetadataEdges([]);
      setKindStyles([]);
      setConnectionTypes(DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES);
      setFocalHopRadius(1);
      return;
    }
    let isCancelled = false;
    void getEntityCooccurrence(projectId).then((result) => {
      if (!isCancelled) setCooccurrence(result);
    });
    void listEntityRelationships(projectId).then((result) => {
      if (!isCancelled) setRelationships(result);
    });
    void getEntityBacklinkEdges(projectId).then((result) => {
      if (!isCancelled) setBacklinkEdges(result);
    });
    void getProximityMentionEdges(projectId).then((result) => {
      if (!isCancelled) setProximityMentions(result);
    });
    void getEntitySharedMetadataEdges(projectId).then((result) => {
      if (!isCancelled) setSharedMetadataEdges(result);
    });
    void getEntityGraphKindStyles(projectId)
      .then((result) => {
        if (!isCancelled) setKindStyles(result);
      })
      .catch((err: unknown) => {
        // `getEntityGraphKindStyles` rejects on any failure rather than
        // degrading (see its own module doc). Falling back to `[]` here
        // keeps this view's own degrade-gracefully posture for its other
        // non-settings reads — every node then renders via Task 5's
        // deterministic fallback style rather than this view throwing or
        // leaving the graph unrendered.
        console.error("Failed to load the entity-graph kind styles.", err);
        if (!isCancelled) setKindStyles([]);
      });
    void getEntityGraphSettings(projectId)
      .then((settings: EntityGraphSettings) => {
        if (!isCancelled) {
          setConnectionTypes(settings.entityGraphConnectionTypes);
          setFocalHopRadius(settings.entityGraphFocalHopRadius);
        }
      })
      .catch(() => {
        // Settings read rejects on failure (see entity-graph-settings.ts's
        // own failure contract); falling back to the defaults here rather
        // than propagating keeps this view's existing degrade-gracefully
        // posture for its other four reads.
        if (!isCancelled) {
          setConnectionTypes(DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES);
          setFocalHopRadius(1);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  // The project's currently active connection-type list, filtered to known
  // keys (Feature 68, Task 13) — threaded down to `EntityGraphCanvas` so it
  // can both snapshot this list onto a newly-saved drag position and decide
  // whether an already-persisted position has been invalidated by a change
  // to this same list since it was saved (FR-11). This is the identical
  // filtered list `graphData`'s own edge-kind filtering below already
  // derives from `connectionTypes`, so no new fetch or state is introduced.
  const activeConnectionTypes = React.useMemo(
    () => filterToKnownConnectionTypes(connectionTypes),
    [connectionTypes],
  );

  const graphData: EntityGraphData = React.useMemo(() => {
    const nodes = buildNodes(aliasTable.entities);
    const activeTypes = new Set(activeConnectionTypes);
    const edges: EntityGraphEdge[] = [];
    if (activeTypes.has("cooccurrence")) {
      edges.push(...buildCooccurrenceEdges(cooccurrence));
    }
    if (activeTypes.has("authored")) {
      edges.push(...buildAuthoredEdges(relationships));
    }
    if (activeTypes.has("backlinks")) {
      edges.push(...buildBacklinkEdges(backlinkEdges));
    }
    if (activeTypes.has("proximityMentions")) {
      edges.push(...buildProximityMentionGraphEdges(proximityMentions));
    }
    if (activeTypes.has("sharedMetadata")) {
      edges.push(...buildSharedMetadataGraphEdges(sharedMetadataEdges));
    }
    return { nodes, edges };
  }, [
    aliasTable,
    cooccurrence,
    relationships,
    backlinkEdges,
    proximityMentions,
    sharedMetadataEdges,
    activeConnectionTypes,
  ]);

  const isEmpty = isEntitiesEnabled && graphData.nodes.length === 0;

  // Measures the canvas's actual available area (Entity Graph canvas-sizing
  // polish) so `EntityGraphCanvas` can be given real `width`/`height` instead
  // of its own fixed 800x560 default — the canvas is sized by numeric props,
  // not CSS, since `computeGraphLayout`'s simulation and the pan/zoom math
  // both need the real pixel dimensions. A `ResizeObserver` (rather than a
  // one-off measurement) keeps it in step with sidebar toggles and window
  // resizes without this view needing to know about either.
  const canvasContainerRef = React.useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = React.useState<{
    width: number;
    height: number;
  } | null>(null);

  React.useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setCanvasSize({ width: Math.max(width, 1), height: Math.max(height, 1) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${className}`}
      data-testid="entity-relationship-graph-view"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-gw-h2 font-semibold text-gw-secondary">
          Relationship Graph
        </h2>
        {isEntitiesEnabled ? (
          <Button
            type="button"
            variant="secondary"
            data-testid="entity-kind-styles-open-button"
            onClick={() => setIsKindStylesModalOpen(true)}
          >
            Kind colors &amp; shapes
          </Button>
        ) : null}
      </div>
      {isEntitiesEnabled && projectId ? (
        <EntityKindStylesModal
          isOpen={isKindStylesModalOpen}
          projectId={projectId}
          declaredEntityKinds={graphData.nodes.map((node) => node.entityKind)}
          onClose={() => setIsKindStylesModalOpen(false)}
          onStylesChanged={refetchKindStyles}
        />
      ) : null}
      {isEmpty ? (
        <p data-testid="entity-relationship-graph-empty-state">
          No entities have been declared yet. Give a resource an entity kind to
          have it appear here.
        </p>
      ) : (
        <>
          <div ref={canvasContainerRef} className="min-h-0 flex-1">
            <EntityGraphCanvas
              nodes={graphData.nodes}
              edges={graphData.edges}
              width={canvasSize?.width}
              height={canvasSize?.height}
              className="h-full w-full"
              onNodeActivated={onEntityActivated}
              projectId={projectId ?? undefined}
              activeConnectionTypes={activeConnectionTypes}
              kindStyles={kindStyles}
              focalEntityId={focalEntityId}
              onFocalEntityChange={setFocalEntityId}
              focalHopRadius={focalHopRadius}
              onSettingsSaved={(settings) => {
                // Feature 68, Task 18 follow-up: without this, a toggle or
                // hop-radius change saved through Task 10's settings panel
                // (rendered inside `EntityGraphCanvas`) had no way to reach
                // this view's own `connectionTypes`/`focalHopRadius` state —
                // the state that actually drives `graphData`'s edge
                // filtering and the hop-radius BFS below — so it only took
                // visible effect after a full remount/reload, contradicting
                // Task 10's own "reflected in graphData without a page
                // reload" requirement.
                setConnectionTypes(settings.entityGraphConnectionTypes);
                setFocalHopRadius(settings.entityGraphFocalHopRadius);
              }}
            />
          </div>
          <EntityGraphAccessibleList
            nodes={graphData.nodes}
            edges={graphData.edges}
            onNodeActivated={onEntityActivated}
            focalEntityId={focalEntityId}
            onSetFocalPoint={setFocalEntityId}
            onClearFocalPoint={() => setFocalEntityId(null)}
            focalHopRadius={focalHopRadius}
          />
        </>
      )}
    </div>
  );
}
