import React from "react";
import { shallowEqual } from "react-redux";
import useAppSelector, { useAppDispatch } from "../../../../src/store/hooks";
import {
  selectEntityAliasTable,
  type EntityAliasTableState,
} from "../../../../src/store/entityAliasTableSlice";
import {
  selectActiveProjectDirectoryId,
  selectIsFeatureEnabled,
} from "../../../../src/store/projectsSlice";
import {
  selectResources,
  updateResource,
} from "../../../../src/store/resourcesSlice";
import {
  getEntityMentionCounts,
  type EntityMentionCounts,
} from "../../../../src/lib/api/entity-mention-counts";
import {
  checkNoiseFlag,
  type NoiseCheckSources,
} from "../../../../src/lib/models/entity-noise-check";
import {
  getNoiseWordLists,
  type NoiseWordLists,
} from "../../../../src/lib/api/project-noise-words";
import { getGlobalNoiseWords } from "../../../../src/lib/api/global-noise-words";
import { updateSidecar } from "../../../../src/lib/api/resources";
import type { NoiseTermKind } from "../../../../src/lib/models/entity-noise-copy";
import type { EntityAliasEntry } from "../../../../src/lib/models/entity-alias-table";
import EntityRosterRowComponent from "./EntityRosterRow";

export interface EntityRosterViewProps {
  /** Optional className for the outer container. */
  className?: string;
  /**
   * Invoked with an entity's `entityId` when its roster row is activated
   * (pointer click, or Enter/Space via the row's native `<button>`) — FR-10.
   * The caller (`AppShell.tsx`) owns both the Redux dispatch of
   * `setSelectedResourceId` and the work-area view switch back to `"edit"`,
   * mirroring the existing `DataView`'s `onResourceClick` pattern in that
   * file. This view never writes to the sidecar itself.
   */
  onEntityActivated?: (entityId: string) => void;
}

/** Normalizes a term the same way `entity-alias-table.ts` does (lowercase,
 * trimmed), so `claimedBy` lookups line up with its keys. */
function normalizeTerm(term: string): string {
  return term.trim().toLowerCase();
}

/** One of an entity's terms (its `name` or one of its `aliases`) that
 * `checkNoiseFlag` has flagged as noise-prone (FR-1/FR-7), paired with the
 * {@link NoiseTermKind} the copy module needs to compose the right
 * observation sentence (`entity-noise-copy.ts`'s `getNoiseObservation`). */
export interface FlaggedNoiseTerm {
  term: string;
  kind: NoiseTermKind;
}

/**
 * One roster row's assembled, derived data: the entity's alias-table entry,
 * its mention count (defaulted to zero when absent from the counts map), and
 * the FR-7/FR-9 "needs attention" state — collapsed into one shared boolean
 * plus the underlying which-condition(s)-apply flags for a later task's
 * accessible-name composition.
 */
export interface EntityRosterRow {
  entry: EntityAliasEntry;
  /** Prose occurrences across the project, and how many resources they span.
   * Both are shown: either alone misleads (see {@link EntityMentionCounts}). */
  counts: EntityMentionCounts;
  /** Whether any of the entity's terms (name or aliases) are claimed by more
   * than one entity, per the alias table's `claimedBy` map (FR-7). */
  ambiguous: boolean;
  /** Whether any of the entity's terms — `name` OR `aliases`, checked
   * identically (FR-1) — trigger `checkNoiseFlag`'s noise heuristic, after
   * dismissal suppression (FR-7/FR-8/FR-13). Equivalent to
   * `flaggedTerms.length > 0`. */
  noiseProne: boolean;
  /** Every one of the entity's own terms currently flagged as noise-prone
   * (FR-1), each paired with whether it's the entity's `name` or an
   * `alias` so the row can render a per-term observation and dismiss
   * control (FR-8/FR-9/FR-13). A term the entity has already dismissed
   * never appears here (`checkNoiseFlag`'s dismissal suppression).
   * Optional so a caller that builds a row by hand without this field
   * (e.g. `EntityRosterRow.test.tsx`, `EntityRosterRow.stories.tsx`) still
   * type-checks; `EntityRosterRow`'s own render treats a missing value the
   * same as an empty array. */
  flaggedTerms?: FlaggedNoiseTerm[];
  /** Single shared "needs attention" state — `ambiguous || noiseProne`
   * (FR-9). */
  needsAttention: boolean;
}

/**
 * Derives whether any of an entity's terms are ambiguously claimed by
 * another entity, per the alias table's `claimedBy` map (FR-7).
 */
function isAmbiguous(
  entry: EntityAliasEntry,
  claimedBy: Record<string, string[]>,
): boolean {
  return entry.terms.some((term) => normalizeTerm(term) in claimedBy);
}

/**
 * Derives every one of an entity's own terms — its `name` AND its
 * `aliases`, checked by the identical `checkNoiseFlag` mechanism with no
 * branching on which kind of term it is (FR-1) — currently flagged as
 * noise-prone, after dismissal suppression (FR-7/FR-8/FR-13).
 *
 * Supersedes this view's previous `isNoiseProne`, which checked only
 * `entry.aliases` and never `entry.name` — a scoping the spec's FR-1
 * requires removed.
 */
function getFlaggedNoiseTerms(
  entry: EntityAliasEntry,
  sources: NoiseCheckSources,
): FlaggedNoiseTerm[] {
  const flagged: FlaggedNoiseTerm[] = [];
  if (entry.name && checkNoiseFlag(entry.name, sources)) {
    flagged.push({ term: entry.name, kind: "name" });
  }
  for (const alias of entry.aliases) {
    if (checkNoiseFlag(alias, sources)) {
      flagged.push({ term: alias, kind: "alias" });
    }
  }
  return flagged;
}

/**
 * Normalizes a noise-flagging term for dismissal storage/lookup: trims
 * surrounding whitespace, then case-folds to lower case. Mirrors
 * `resource-crud-core.ts`'s `normalizeNoiseTerm` (Task 7) and
 * `entity-noise-check.ts`'s internal normalization exactly, re-declared
 * here because this is a client component and `resource-crud-core.ts`
 * is a server-only model module (reads `node:fs` via `readSidecar`) that
 * cannot be imported from client code.
 */
function normalizeNoiseTermForDismissal(term: string): string {
  return term.trim().toLowerCase();
}

/**
 * `EntityRosterView` is the project-wide entity roster (FR-1). Like
 * `OrganizerView`/`TimelineView`, it has no dependency on the currently
 * selected resource in the resource tree.
 *
 * Assembles the roster's data: every entity in the cached
 * `EntityAliasTable` (`entityAliasTableSlice`, no new fetch), each entity's
 * mention count (a one-shot `getEntityMentionCounts` call on mount/project
 * change, FR-6), the project's custom/excluded and cross-project global
 * noise-word lists (also fetched once per project, Tasks 6/11), sorted
 * alphabetically by name (FR-4), annotated with the FR-1/FR-7/FR-9 "needs
 * attention" state covering BOTH an entity's `name` and its `aliases`, and
 * the FR-11 empty state. Each flagged term's observation and per-entity-
 * per-term dismiss control (FR-8/FR-9/FR-13) are rendered by
 * `EntityRosterRow`.
 */
export default function EntityRosterView({
  className = "",
  onEntityActivated,
}: EntityRosterViewProps): JSX.Element {
  const dispatch = useAppDispatch();
  const aliasTable = useAppSelector(
    (s): EntityAliasTableState["table"] => selectEntityAliasTable(s),
    shallowEqual,
  );
  const isEntitiesEnabled = useAppSelector((s) =>
    selectIsFeatureEnabled(s, "entities"),
  );
  const resources = useAppSelector((s) => selectResources(s.resources));
  // Directory basename, not `project.id` — matches `OrganizerView`'s use of
  // `selectActiveProjectDirectoryId` for tenant-scoped API calls.
  const projectId = useAppSelector((s) => selectActiveProjectDirectoryId(s));

  const [mentionCounts, setMentionCounts] = React.useState<
    Record<string, EntityMentionCounts>
  >({});
  // The project's custom/excluded noise-word lists (Task 6) and the
  // cross-project global list (Task 11), fetched once per project rather
  // than per row — mirroring the mention-count fetch above. A failed read
  // degrades to the predecessor's bundled-list-only behavior (empty
  // project/global lists) rather than blocking the roster from rendering;
  // a missing custom/global term only under- rather than over-flags, so
  // this degrade never hides a genuine ambiguity the alias table itself
  // already surfaces.
  const [noiseWordLists, setNoiseWordLists] = React.useState<NoiseWordLists>({
    customNoiseWords: [],
    excludedGlobalNoiseWords: [],
  });
  const [globalNoiseWords, setGlobalNoiseWords] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!projectId) {
      setMentionCounts({});
      return;
    }
    let isCancelled = false;
    void getEntityMentionCounts(projectId).then((result) => {
      if (!isCancelled) setMentionCounts(result);
    });
    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  React.useEffect(() => {
    if (!projectId) {
      setNoiseWordLists({ customNoiseWords: [], excludedGlobalNoiseWords: [] });
      return;
    }
    let isCancelled = false;
    void getNoiseWordLists(projectId)
      .then((result) => {
        if (!isCancelled) setNoiseWordLists(result);
      })
      .catch(() => {
        if (!isCancelled) {
          setNoiseWordLists({
            customNoiseWords: [],
            excludedGlobalNoiseWords: [],
          });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  React.useEffect(() => {
    if (!projectId) {
      setGlobalNoiseWords([]);
      return;
    }
    let isCancelled = false;
    void getGlobalNoiseWords()
      .then((result) => {
        if (!isCancelled) setGlobalNoiseWords(result);
      })
      .catch(() => {
        if (!isCancelled) setGlobalNoiseWords([]);
      });
    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  const resourcesById = React.useMemo(() => {
    const map = new Map<string, (typeof resources)[number]>();
    for (const resource of resources) {
      map.set(resource.id, resource);
    }
    return map;
  }, [resources]);

  const rows: EntityRosterRow[] = Object.values(aliasTable.entities)
    .map((entry) => {
      const isAmbiguousEntity = isAmbiguous(entry, aliasTable.claimedBy);
      const sources: NoiseCheckSources = {
        projectCustomNoiseWords: noiseWordLists.customNoiseWords,
        projectExcludedGlobalNoiseWords:
          noiseWordLists.excludedGlobalNoiseWords,
        globalNoiseWords,
        dismissedNoiseTerms: resourcesById.get(entry.entityId)
          ?.dismissedNoiseTerms,
      };
      const flaggedTerms = getFlaggedNoiseTerms(entry, sources);
      return {
        entry,
        counts: mentionCounts[entry.entityId] ?? { mentions: 0, resources: 0 },
        ambiguous: isAmbiguousEntity,
        noiseProne: flaggedTerms.length > 0,
        flaggedTerms,
        needsAttention: isAmbiguousEntity || flaggedTerms.length > 0,
      };
    })
    .sort((a, b) =>
      a.entry.name.toLowerCase().localeCompare(b.entry.name.toLowerCase()),
    );

  const isEmpty = isEntitiesEnabled && rows.length === 0;

  /**
   * Dismisses (or un-dismisses) one entity's own flagged `term`
   * (FR-8/FR-9/FR-13), persisting through the existing `updateSidecar`
   * write path rather than a new transport (FR-9 — `setNoiseTermDismissedCore`,
   * Task 7, has no HTTP route or client transport wired to it yet, so this
   * replicates its normalize-and-merge logic client-side, the same approach
   * `EntitySection.tsx`'s Task 14 integration takes). Scoped to this one
   * entity's own sidecar `dismissedNoiseTerms` array only — dismissing
   * "Case" on one entity never touches another entity's copy of the same
   * term (FR-13), since each entity's dismissed-terms list is read and
   * written independently here, keyed by `entityId`.
   */
  const handleDismissTerm = (entityId: string, term: string): void => {
    const resource = resourcesById.get(entityId);
    if (!resource || !projectId) return;

    const normalized = normalizeNoiseTermForDismissal(term);
    const current = resource.dismissedNoiseTerms ?? [];
    if (current.includes(normalized)) return;
    const next = [...current, normalized];
    const updated = { ...resource, dismissedNoiseTerms: next };

    void updateSidecar(entityId, projectId, updated).then(() => {
      dispatch(updateResource({ id: entityId, dismissedNoiseTerms: next }));
    });
  };

  return (
    <div className={className} data-testid="entity-roster-view">
      {isEmpty ? (
        <p data-testid="entity-roster-empty-state">
          No entities have been declared yet. Give a resource an entity kind to
          have it appear here.
        </p>
      ) : (
        <ul data-testid="entity-roster-list">
          {rows.map((row) => (
            <EntityRosterRowComponent
              key={row.entry.entityId}
              row={row}
              onActivate={() => onEntityActivated?.(row.entry.entityId)}
              onDismissTerm={(term) =>
                handleDismissTerm(row.entry.entityId, term)
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
