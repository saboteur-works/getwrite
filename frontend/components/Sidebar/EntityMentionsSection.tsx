"use client";

import { useEffect, useState } from "react";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import {
  selectResource,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { useEntityMentions } from "./EntityMentionsContext";
import { getEntityCooccurrence } from "../../src/lib/api/entity-cooccurrence";
import type { EntityCooccurrenceEntry } from "../../src/lib/api/entity-cooccurrence";
import { selectEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";

/**
 * Read-only sidebar section for an entity's own view: every resource
 * associated with the selected entity, merging two sources into one list
 * (Task 15, FR-10/FR-12/FR-14):
 *
 * - Explicit links (the entity's `linkedFrom` backlinks) — labeled "Linked".
 * - Detected prose mentions, one snippet per occurrence — labeled
 *   "Mentioned".
 *
 * The merge itself happens server-side in `mentions-core.ts`'s
 * `getEntityMentionedIn` (see that module's doc comment for the full
 * rationale): a resource that is both linked and mentioned is returned once
 * with both flags set, so this component never needs to dedup two
 * differently-shaped responses itself — it only renders the flags it's
 * given.
 *
 * Only renders (and only fetches) when the selected resource has
 * `entityKind` set — this section is the *entity's* view, distinct from
 * `EntitiesMentionedSection.tsx`, which is the read-only "entities detected
 * in *this* resource" section shown on every resource (FR-9).
 *
 * Follows the same loading/empty-state and navigation conventions as
 * `EntitiesMentionedSection.tsx`: a visible loading placeholder, no static
 * "nothing here" state, and navigation via
 * `dispatch(setSelectedResourceId(resourceId))` rather than a route.
 *
 * The entity-scoped compile trigger used to live here too. It now renders
 * from `EntityCompileSection.tsx`, so that collapsing the "Entity Mentions"
 * section in `MetadataSidebar.tsx` no longer hides the compile action along
 * with this list. Both read the same rows through
 * `EntityMentionsContext.tsx`, which owns the `getEntityMentionedIn` fetch
 * this component previously made for itself.
 */

/**
 * Task 5 addition (`specs/features/entity-cooccurrence.md`) — confirms the
 * project-wide `EntityAliasTable` cache `entityAliasTableSlice` already
 * populates (refetched on project load, resource load, and a resolved
 * sidecar save — see that module's doc comment) is reachable from this
 * component via `useAppSelector(selectEntityAliasTable)`. Reads the existing
 * cache only: no new fetch, no new dispatch. Task 6 will call this alongside
 * `resolveCooccurringEntityName` below to render the "Also appears with"
 * list; nothing in this component's own render output changes yet.
 */
export function useEntityAliasTable(): EntityAliasTable {
  return useAppSelector(selectEntityAliasTable);
}

/**
 * Resolves a co-occurring entity's display name from `aliasTable`. Falls
 * back to the raw `entityId` — rather than throwing or rendering blank —
 * when the id is absent from the table, e.g. a stale reference to a deleted
 * or renamed entity (Task 5 done-when).
 */
export function resolveCooccurringEntityName(
  aliasTable: EntityAliasTable,
  entityId: string,
): string {
  return aliasTable.entities[entityId]?.name ?? entityId;
}

/**
 * Task 6 addition (`specs/features/entity-cooccurrence.md`, FR-6/FR-7/FR-8/
 * FR-9) — renders the selected entity's "Also appears with" list.
 *
 * Deliberately reads `cooccurrence[selectedEntityId]` (a project-wide map
 * fetched separately via {@link getEntityCooccurrence}, restricted here to
 * the selected entity's own id) rather than anything derived from `rows`'
 * merged `isLinked`/`isMentioned` resource set: per FR-2, co-occurrence is
 * counted only from detected mentions sharing a resource, and MUST NOT be
 * conflated with the Mention+Backlink merge `rows` represents.
 *
 * Ordered by count descending, ties broken alphabetically (case-insensitive)
 * by resolved name — the same tie-break `EntityRosterView.tsx` uses for its
 * own name sort. Renders nothing at all — no heading, line, or empty-state
 * text — when the entity has no co-occurrence entries (FR-7), matching this
 * component's documented no-static-empty-state convention. Plain text, not
 * the "Linked"/"Mentioned" badge markup (FR-8): a co-occurrence entry is an
 * observation of shared prose proximity, not an authored relationship.
 */
function CooccurrenceList({
  entries,
  aliasTable,
}: {
  entries: EntityCooccurrenceEntry[];
  aliasTable: EntityAliasTable;
}): JSX.Element | null {
  if (entries.length === 0) return null;

  const named = entries.map((entry) => ({
    entityId: entry.entityId,
    count: entry.count,
    name: resolveCooccurringEntityName(aliasTable, entry.entityId),
  }));

  named.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  return (
    <div className="text-gw-nano text-gw-secondary">
      <span>Also appears with: </span>
      <ul className="inline" aria-label="entity-cooccurrence-list">
        {named.map((entry, index) => (
          <li key={entry.entityId} className="inline">
            {entry.name} ({entry.count}){index < named.length - 1 ? ", " : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EntityMentionsSection(): JSX.Element | null {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const resource = useAppSelector((state) => selectResource(state.resources));
  const dispatch = useAppDispatch();

  // `rows` and `isLoading` come from the shared fetch in
  // `EntityMentionsContext.tsx`, which `EntityCompileSection` reads too —
  // see that module's doc comment for why the fetch was lifted out of here.
  const { rows, isLoading } = useEntityMentions();
  const [cooccurrenceEntries, setCooccurrenceEntries] = useState<
    EntityCooccurrenceEntry[]
  >([]);
  const aliasTable = useEntityAliasTable();

  const resourceId = resource?.id;
  const entityKind = resource?.entityKind;

  // Task 6 (FR-6): fetched separately from `rows` above, and NEVER derived
  // from `rows`' merged `isLinked`/`isMentioned` resource set — see the
  // `CooccurrenceList` doc comment for why (FR-2).
  useEffect(() => {
    if (!projectId || !resourceId || !entityKind) {
      setCooccurrenceEntries([]);
      return;
    }

    let isCancelled = false;
    void getEntityCooccurrence(projectId).then((cooccurrence) => {
      if (isCancelled) return;
      setCooccurrenceEntries(cooccurrence[resourceId] ?? []);
    });

    return () => {
      isCancelled = true;
    };
  }, [projectId, resourceId, entityKind]);

  if (!projectId || !resourceId || !entityKind) return null;

  if (isLoading) {
    return (
      <p className="text-gw-nano text-gw-secondary" role="status">
        Loading mentions&hellip;
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="entity-mentions-list">
          {rows.map((row) => (
            <li key={row.resourceId} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="text-left text-gw-label text-gw-primary hover:text-gw-secondary transition-colors duration-150"
                  onClick={() =>
                    dispatch(setSelectedResourceId(row.resourceId))
                  }
                >
                  {row.name}
                </button>
                {row.isLinked && (
                  <span
                    className="text-gw-nano uppercase tracking-label px-1.5 py-0.5 rounded border border-gw-border text-gw-secondary"
                    aria-label={`${row.name}-linked-badge`}
                  >
                    Linked
                  </span>
                )}
                {row.isMentioned && (
                  <span
                    className="text-gw-nano uppercase tracking-label px-1.5 py-0.5 rounded border border-gw-border text-gw-secondary"
                    aria-label={`${row.name}-mentioned-badge`}
                  >
                    Mentioned
                  </span>
                )}
              </div>

              {row.snippets.length > 0 && (
                <ul
                  className="flex flex-col gap-1 pl-2"
                  aria-label={`${row.name}-snippets`}
                >
                  {row.snippets.map((snippet, index) => {
                    const ambiguousWith = row.ambiguousWith[index] ?? [];
                    return (
                      <li key={index}>
                        <p className="text-gw-nano text-gw-secondary">
                          {snippet}
                        </p>
                        {ambiguousWith.length > 0 && (
                          <p className="text-gw-nano text-gw-secondary italic">
                            Ambiguous &mdash; also matches{" "}
                            {ambiguousWith.join(", ")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <CooccurrenceList entries={cooccurrenceEntries} aliasTable={aliasTable} />
    </div>
  );
}
