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
  getEntityMentionCounts,
  type EntityMentionCounts,
} from "../../../../src/lib/api/entity-mention-counts";
import { getAliasWarning } from "../../../../src/lib/models/entity-alias-warnings";
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
  /** Whether any of the entity's declared aliases (not its name) trigger
   * `getAliasWarning`'s short/common-word noise heuristic (FR-7). */
  noiseProne: boolean;
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
 * Derives whether any of an entity's declared aliases (not its name) are
 * flagged as noise-prone by `getAliasWarning` (FR-7).
 */
function isNoiseProne(entry: EntityAliasEntry): boolean {
  return entry.aliases.some((alias) => getAliasWarning(alias) !== null);
}

/**
 * `EntityRosterView` is the project-wide entity roster (FR-1). Like
 * `OrganizerView`/`TimelineView`, it has no dependency on the currently
 * selected resource in the resource tree.
 *
 * This task assembles the roster's data: every entity in the cached
 * `EntityAliasTable` (`entityAliasTableSlice`, no new fetch), each entity's
 * mention count (a one-shot `getEntityMentionCounts` call on mount/project
 * change, FR-6), sorted alphabetically by name (FR-4), annotated with the
 * FR-7/FR-9 "needs attention" state, and the FR-11 empty state. Row markup
 * stays minimal/structural here — Task 7 builds the real accessible row.
 */
export default function EntityRosterView({
  className = "",
  onEntityActivated,
}: EntityRosterViewProps): JSX.Element {
  const aliasTable = useAppSelector(
    (s): EntityAliasTableState["table"] => selectEntityAliasTable(s),
    shallowEqual,
  );
  const isEntitiesEnabled = useAppSelector((s) =>
    selectIsFeatureEnabled(s, "entities"),
  );
  // Directory basename, not `project.id` — matches `OrganizerView`'s use of
  // `selectActiveProjectDirectoryId` for tenant-scoped API calls.
  const projectId = useAppSelector((s) => selectActiveProjectDirectoryId(s));

  const [mentionCounts, setMentionCounts] = React.useState<
    Record<string, EntityMentionCounts>
  >({});

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

  const rows: EntityRosterRow[] = Object.values(aliasTable.entities)
    .map((entry) => {
      const isAmbiguousEntity = isAmbiguous(entry, aliasTable.claimedBy);
      const isNoiseProneEntity = isNoiseProne(entry);
      return {
        entry,
        counts: mentionCounts[entry.entityId] ?? { mentions: 0, resources: 0 },
        ambiguous: isAmbiguousEntity,
        noiseProne: isNoiseProneEntity,
        needsAttention: isAmbiguousEntity || isNoiseProneEntity,
      };
    })
    .sort((a, b) =>
      a.entry.name.toLowerCase().localeCompare(b.entry.name.toLowerCase()),
    );

  const isEmpty = isEntitiesEnabled && rows.length === 0;

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
            />
          ))}
        </ul>
      )}
    </div>
  );
}
