import React from "react";
import type { EntityRosterRow as EntityRosterRowData } from "./EntityRosterView";
import type { EntityMentionCounts } from "../../../../src/lib/api/entity-mention-counts";

export interface EntityRosterRowProps {
  row: EntityRosterRowData;
  /** Invoked when the row's button is activated (click or keyboard). Task 8
   * wires this to real navigation — this component only forwards the call. */
  onActivate: () => void;
}

/**
 * Builds the FR-5 mention-count display text: a distinguishing "No mentions
 * yet" label for a zero count (explicit or absent from the counts map),
 * otherwise "N mentions in M documents".
 *
 * Both numbers are shown because either alone misleads. This row previously
 * read "32 mentions" for an entity mentioned 593 times across 32 resources —
 * the count was the resource total wearing the word "mentions", which is not
 * what the glossary means by a Mention (a prose occurrence carrying a
 * character offset). Spread and intensity are separate facts about an entity
 * and a writer wants both: 593-across-32 and 32-across-32 describe very
 * different characters.
 *
 * The single-document case reads "N mentions in 1 document" rather than being
 * special-cased away, so the two numbers stay in a consistent position for a
 * reader scanning a column of rows.
 */
function formatMentionCountText(counts: EntityMentionCounts): string {
  if (counts.mentions === 0) return "No mentions yet";
  const mentions = `${counts.mentions} mention${counts.mentions === 1 ? "" : "s"}`;
  const documents = `${counts.resources} document${counts.resources === 1 ? "" : "s"}`;
  return `${mentions} in ${documents}`;
}

/**
 * Composes the FR-8 accessible-name disclosure text naming which "needs
 * attention" condition(s) apply (FR-7), or `null` when none apply. This text
 * is rendered as visually-hidden content inside the row's button so it folds
 * into the button's accessible name (FR-12) rather than surfacing only via
 * hover/`title`.
 */
function composeAttentionDisclosure(row: EntityRosterRowData): string | null {
  if (!row.needsAttention) return null;
  const conditions: string[] = [];
  if (row.ambiguous) conditions.push("ambiguous claim");
  if (row.noiseProne) conditions.push("noise-prone alias");
  return `Needs attention: ${conditions.join(" and ")}.`;
}

/**
 * One entity roster row (FR-8, FR-9, FR-12). Reuses the `<li>`-wraps-native-
 * `<button type="button">` pattern from `ResourceListItem.tsx` so the row is
 * reachable by its accessible role/name and operable by keyboard alone, with
 * no nested interactive control inside the button.
 *
 * The FR-7/FR-9 "needs attention" state is a single shared visual treatment
 * (no third, roster-specific visual language) styled with the same CSS
 * variable entity highlighting already uses for its own "needs attention"
 * decoration (`--color-gw-entity-highlight-attention`) — never the reserved
 * `red`/`#D44040` position/canonical-state token.
 */
export default function EntityRosterRow({
  row,
  onActivate,
}: EntityRosterRowProps): JSX.Element {
  const attentionDisclosure = composeAttentionDisclosure(row);

  return (
    <li className="workarea-list-item" data-testid="entity-roster-row">
      <button
        type="button"
        onClick={onActivate}
        className="flex w-full items-center justify-between text-left hover:bg-gw-chrome2 -mx-2 px-2 rounded transition-colors duration-150"
      >
        <div className="flex flex-col min-w-0">
          <span
            className="workarea-list-item-label truncate"
            data-testid="entity-roster-row-name"
          >
            {row.entry.name}
          </span>
          <span
            className="workarea-list-item-meta"
            data-testid="entity-roster-row-kind"
          >
            {row.entry.entityKind}
          </span>
          <span
            className="workarea-list-item-meta"
            data-testid="entity-roster-row-aliases"
          >
            {row.entry.aliases.join(", ")}
          </span>
        </div>
        <div className="flex flex-col items-end shrink-0 pl-4">
          <span
            className="workarea-list-item-meta"
            data-testid="entity-roster-row-mention-count"
            data-zero-mentions={row.counts.mentions === 0}
          >
            {formatMentionCountText(row.counts)}
          </span>
          <span
            className="workarea-list-item-meta"
            data-testid="entity-roster-row-needs-attention"
            data-needs-attention={row.needsAttention}
            data-ambiguous={row.ambiguous}
            data-noise-prone={row.noiseProne}
            style={
              row.needsAttention
                ? {
                    backgroundColor:
                      "var(--color-gw-entity-highlight-attention)",
                    // The shared `.workarea-list-item-meta` text color
                    // (`--color-gw-secondary`) doesn't clear WCAG AA
                    // contrast against this indicator's tinted background
                    // (measured ~2.9:1 via axe's color-contrast rule,
                    // against a 4.5:1 minimum). Override to the
                    // theme-aware `--color-gw-primary` token (near-black
                    // in light mode, near-white in dark mode) for this
                    // indicator only, rather than changing the shared
                    // class every other roster-row field still uses.
                    color: "var(--color-gw-primary)",
                  }
                : undefined
            }
          >
            {row.needsAttention ? "Needs attention" : ""}
          </span>
        </div>
        {attentionDisclosure !== null ? (
          <span className="sr-only">{attentionDisclosure}</span>
        ) : null}
      </button>
    </li>
  );
}
