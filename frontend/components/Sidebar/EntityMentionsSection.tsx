"use client";

import { useEffect, useState } from "react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import {
  selectResource,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { useEntityMentions } from "./EntityMentionsContext";
import type { EntityMentionedIn } from "../../src/lib/models/mentions-core";
import { getEntityCooccurrence } from "../../src/lib/api/entity-cooccurrence";
import type { EntityCooccurrenceEntry } from "../../src/lib/api/entity-cooccurrence";
import { selectEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";
import { getActiveEditor } from "../Editor/activeEditorRegistry";
import {
  resolveOffsetToPosition,
  isOffsetStillAMention,
} from "../Editor/offset-resolver";
import { applyMentionJumpHighlight } from "../Editor/Extensions/MentionJumpHighlightExtension";
import {
  escapeRegExp,
  POSSESSIVE_OR_PLURAL_SUFFIX,
} from "../../src/lib/models/entity-detection";

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
 * Task 11 addition (`specs/features/entity-mention-navigation.md`, FR-4/FR-8)
 * — temporary fixed duration for the one-shot "landed here" flash applied
 * after a same-resource mention jump. A later task (Task 12) reads the
 * real, project-configured `mentionHighlightDurationSeconds` instead; this
 * constant is a deliberate stand-in until that wiring lands.
 */
const TEMPORARY_MENTION_JUMP_HIGHLIGHT_DURATION_MS = 2000;

/**
 * How many plain-text characters past a resolved jump position to search,
 * at most, for the matched term's own length when building the jump-
 * highlight span (Task 11, FR-8). Generous enough to contain the longest
 * realistic name/alias plus its possessive/plural suffix.
 */
const MENTION_SPAN_SEARCH_WINDOW = 128;

/**
 * Resolves the `{ from, to }` span of the entity term starting at `position`
 * for {@link applyMentionJumpHighlight}'s decoration, so the one-shot flash
 * covers the matched text itself rather than only its starting character.
 *
 * Tries each of `terms` (longest first, so a longer term that happens to be
 * a prefix of a shorter one is preferred) against the text immediately
 * following `position`, using the same case-insensitive possessive/plural
 * envelope `isOffsetStillAMention` already confirmed matches somewhere in
 * this neighborhood. Falls back to a single-character span — rather than
 * throwing or highlighting nothing — on the (expected to be rare, since the
 * staleness check already passed) case where no term matches exactly at
 * `position` within the search window.
 */
function resolveMentionHighlightSpan(
  doc: ProseMirrorNode,
  position: number,
  terms: string[],
): { from: number; to: number } {
  const docSize = doc.content.size;
  const windowEnd = Math.min(docSize, position + MENTION_SPAN_SEARCH_WINDOW);
  const windowText = doc.textBetween(position, windowEnd, "\n");

  const sortedTerms = terms
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .sort((a, b) => b.length - a.length);

  for (const term of sortedTerms) {
    const pattern = new RegExp(
      `^(?:${escapeRegExp(term)})${POSSESSIVE_OR_PLURAL_SUFFIX}`,
      "iu",
    );
    const match = pattern.exec(windowText);
    if (match) {
      return { from: position, to: position + match[0].length };
    }
  }

  return { from: position, to: Math.min(docSize, position + 1) };
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
    <div className="text-gw-micro text-gw-secondary">
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

  /**
   * Task 11 (FR-4/FR-6/FR-7): handles a click on one mention snippet.
   *
   * Only acts when `row`'s resource is already the selected one — the
   * entity's own resource mentioning itself in its own prose, the only case
   * this task is in scope for (FR-6, a different resource's row keeps its
   * existing resource-name-only navigation, handled by the plain
   * `setSelectedResourceId` dispatch on the name button below). Applies
   * identically to an ambiguous snippet (FR-4): there is no special-casing
   * branch for `ambiguousWith` here.
   *
   * Resolves the snippet's persisted offset against the *live* editor
   * document (`getActiveEditor()`, since the live document can differ from
   * what the offset was recorded against), re-confirms the resolved
   * position still reads as a mention of this entity (FR-9's staleness
   * check), and only on that success moves the selection, scrolls it into
   * view, and shows the one-shot jump highlight — a stale or unresolved
   * offset silently does nothing rather than jumping to the wrong place.
   */
  const handleSnippetClick = (
    row: EntityMentionedIn,
    snippetIndex: number,
  ): void => {
    if (row.resourceId !== resourceId) return;

    const editor = getActiveEditor();
    if (!editor) return;

    const offset = row.offsets[snippetIndex];
    if (offset === undefined) return;

    const doc = editor.state.doc;
    const position = resolveOffsetToPosition(doc, offset);
    if (position === null) return;

    const terms = aliasTable.entities[resourceId]?.terms ?? [];
    if (!isOffsetStillAMention(doc, position, terms)) return;

    editor.chain().setTextSelection(position).scrollIntoView().run();

    const span = resolveMentionHighlightSpan(doc, position, terms);
    applyMentionJumpHighlight(
      editor.view,
      span,
      TEMPORARY_MENTION_JUMP_HIGHLIGHT_DURATION_MS,
    );
  };

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
      <p className="text-gw-label text-gw-secondary" role="status">
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
                        <button
                          type="button"
                          className="text-left text-gw-micro text-gw-secondary hover:text-gw-primary transition-colors duration-150"
                          onClick={() => handleSnippetClick(row, index)}
                        >
                          {snippet}
                        </button>
                        {ambiguousWith.length > 0 && (
                          <p className="text-gw-micro text-gw-secondary italic">
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
