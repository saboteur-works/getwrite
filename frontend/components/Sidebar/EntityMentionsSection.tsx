"use client";

import { useEffect, useState } from "react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import {
  selectResource,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import {
  selectActiveProjectDirectoryId,
  selectActiveProjectMentionHighlightDurationSeconds,
} from "../../src/store/projectsSlice";
import { useEntityMentions } from "./EntityMentionsContext";
import type { EntityMentionedIn } from "../../src/lib/models/mentions-core";
import { getEntityCooccurrence } from "../../src/lib/api/entity-cooccurrence";
import type { EntityCooccurrenceEntry } from "../../src/lib/api/entity-cooccurrence";
import { selectEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";
import {
  getActiveEditor,
  getActiveEditorResourceId,
} from "../Editor/activeEditorRegistry";
import {
  resolveOffsetToPosition,
  isOffsetStillAMention,
} from "../Editor/offset-resolver";
import { applyMentionJumpHighlight } from "../Editor/Extensions/MentionJumpHighlightExtension";
import { resolveMentionHighlightDurationSeconds } from "../../src/lib/api/mention-highlight-duration";
import { toastService } from "../../src/lib/toast-service";
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
 * Task 12 addition (`specs/features/entity-mention-navigation.md`, FR-9) —
 * fixed message and stable, deduplicated toast id for a mention-snippet
 * click whose resolved offset no longer reads as an occurrence of the
 * entity's own name/aliases (the staleness check, `isOffsetStillAMention`).
 * Carries no raw document/snippet text, per FR-9. The stable id is what
 * keeps two rapid repeated clicks from stacking two toasts — `toastService
 * .error`'s underlying `toast.error` collapses a second call with the same
 * `id` into the first's slot rather than queuing a new one.
 */
export const STALE_MENTION_JUMP_TOAST_ID = "entity-mention-jump-stale";
const STALE_MENTION_JUMP_TOAST_MESSAGE =
  "This mention may be out of date and could not be found at that location.";

/**
 * Task 12 addition (FR-5) — polling interval/timeout for
 * {@link waitForResourceContentLoaded}, below. The interval is short enough
 * that a writer waiting on an ordinary local fetch never notices it; the
 * timeout is generous enough to outlast a slow read without hanging a click
 * handler forever if the switch never settles (e.g. the target resource was
 * deleted out from under the click).
 */
const RESOURCE_SWITCH_POLL_INTERVAL_MS = 25;
const RESOURCE_SWITCH_POLL_TIMEOUT_MS = 5000;

/**
 * Task 12 addition (`specs/features/entity-mention-navigation.md`, FR-5) —
 * resolves once the *live* editor registry (`activeEditorRegistry.ts`)
 * reports both a mounted editor AND that `targetResourceId` is the resource
 * whose content it reflects — the tag `EditView.tsx` writes only once its
 * own `loadState` settles to `"loaded"` (see that module's doc comment).
 * Resolves `false` on timeout rather than hanging forever, so a click whose
 * target resource never finishes loading (e.g. it was deleted, or the read
 * failed) eventually gives up instead of leaving the handler pending.
 *
 * There is no existing promise-based "content finished loading" signal to
 * await instead: `useRevisionContent.ts`'s own `loadState` is local React
 * state owned by `EditView`, a sibling subtree with no shared context
 * reaching `EntityMentionsSection` (the same reason `activeEditorRegistry.ts`
 * itself exists, per its doc comment) — so this polls the same registry the
 * same-resource jump already reads from, rather than inventing a second,
 * parallel signaling mechanism.
 */
function waitForResourceContentLoaded(
  targetResourceId: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + RESOURCE_SWITCH_POLL_TIMEOUT_MS;
    const check = (): void => {
      if (
        getActiveEditor() !== null &&
        getActiveEditorResourceId() === targetResourceId
      ) {
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      setTimeout(check, RESOURCE_SWITCH_POLL_INTERVAL_MS);
    };
    check();
  });
}

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
  const configuredHighlightDurationSeconds = useAppSelector(
    selectActiveProjectMentionHighlightDurationSeconds,
  );

  const resourceId = resource?.id;
  const entityKind = resource?.entityKind;

  /**
   * Task 11/12 — resolves `row`'s snippet offset against the *live* editor
   * document (`getActiveEditor()`, since the live document can differ from
   * what the offset was recorded against), re-confirms the resolved
   * position still reads as a mention of this entity (FR-9's staleness
   * check), and only on that success moves the selection, scrolls it into
   * view, and shows the one-shot jump highlight.
   *
   * Always resolves the entity's own terms via the closed-over `resourceId`/
   * `aliasTable` from the render that owned the click — i.e. the entity
   * being *viewed*, not whatever resource happens to be selected by the time
   * this runs. That matters for the cross-resource case: by the time this
   * fires, `dispatch(setSelectedResourceId(row.resourceId))` has already
   * changed the selected resource, which (for a plain mention row, not
   * itself an entity) un-mounts this whole component — but the already-
   * running async closure keeps its own captured values regardless, so the
   * entity whose mentions these are stays correct.
   *
   * An unresolved offset (`resolveOffsetToPosition` returns `null`) silently
   * does nothing, matching Task 11's existing behavior — distinct from a
   * failed staleness check (FR-9), which no-ops too but additionally shows
   * the toast below, since staleness is a confirmed, nameable condition
   * ("this used to be a mention, isn't anymore") while an out-of-range
   * offset is not.
   */
  const performMentionJump = (
    row: EntityMentionedIn,
    snippetIndex: number,
  ): void => {
    const editor = getActiveEditor();
    if (!editor) return;

    const offset = row.offsets[snippetIndex];
    if (offset === undefined) return;

    const doc = editor.state.doc;
    const position = resolveOffsetToPosition(doc, offset);
    if (position === null) return;

    const terms = aliasTable.entities[resourceId ?? ""]?.terms ?? [];
    if (!isOffsetStillAMention(doc, position, terms)) {
      toastService.error(STALE_MENTION_JUMP_TOAST_MESSAGE, undefined, {
        id: STALE_MENTION_JUMP_TOAST_ID,
      });
      return;
    }

    editor.chain().setTextSelection(position).scrollIntoView().run();
    // ProseMirror's own `.scrollIntoView()` chain command above walks DOM
    // ancestors looking for a scrollable one by computed `overflow` style,
    // and in this app's layout that walk doesn't find (or doesn't scroll)
    // the real scrollable pane — verified live: the selection moves
    // correctly (`editor.state.selection.from` matches the resolved
    // position and stays there), but the viewport never follows it. The
    // browser's own native `Element.scrollIntoView()`, called on the actual
    // DOM node at the resolved position, finds the right scrollable
    // ancestor reliably because it's the browser's own layout engine doing
    // the walk, not a heuristic re-implementation of it. Kept alongside the
    // chain command (not instead of it) since the chain command is still
    // correct, just insufficient on its own here; `editor.view` is guarded
    // optional since a test double for `editor` need not provide a real
    // ProseMirror view, and `scrollIntoView` itself is guarded optional
    // since it's unimplemented in this project's non-browser DOM test
    // environments (and in jsdom).
    const domPosition = editor.view?.domAtPos?.(position);
    const domNode = domPosition
      ? domPosition.node.nodeType === Node.TEXT_NODE
        ? domPosition.node.parentElement
        : (domPosition.node as Element)
      : null;
    domNode?.scrollIntoView?.({ block: "center", behavior: "auto" });

    const span = resolveMentionHighlightSpan(doc, position, terms);
    const durationMs =
      resolveMentionHighlightDurationSeconds(
        configuredHighlightDurationSeconds,
      ) * 1000;
    applyMentionJumpHighlight(editor.view, span, durationMs);
  };

  /**
   * Task 11/12 (FR-4/FR-5/FR-6/FR-7/FR-9): handles a click on one mention
   * snippet.
   *
   * Same-resource (FR-4): jumps immediately against the already-live editor
   * document — the entity's own resource mentioning itself in its own
   * prose. Applies identically to an ambiguous snippet: there is no
   * special-casing branch for `ambiguousWith` here.
   *
   * Cross-resource (FR-5): a different resource's row keeps the existing
   * resource-name-only navigation on its name button (`setSelectedResourceId`,
   * unchanged), but a click on the *snippet* itself now also dispatches that
   * same switch, waits for the newly selected resource's content to settle
   * into the editor (`waitForResourceContentLoaded`), and only then runs the
   * identical resolve/staleness-check/jump sequence against the *newly
   * loaded* document — never against whatever the editor still showed from
   * the previous resource. A switch that never settles (timeout) silently
   * does nothing, the same no-toast treatment as an unresolved offset.
   */
  const handleSnippetClick = async (
    row: EntityMentionedIn,
    snippetIndex: number,
  ): Promise<void> => {
    if (row.resourceId !== resourceId) {
      dispatch(setSelectedResourceId(row.resourceId));
      const isLoaded = await waitForResourceContentLoaded(row.resourceId);
      if (!isLoaded) return;
      performMentionJump(row, snippetIndex);
      return;
    }

    performMentionJump(row, snippetIndex);
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
                          onClick={() => {
                            void handleSnippetClick(row, index);
                          }}
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
