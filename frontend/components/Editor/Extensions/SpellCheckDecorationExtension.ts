import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { SpellCheckerState } from "../../../src/store/spellingAvailabilitySlice";

/**
 * @module SpellCheckDecorationExtension
 *
 * View-only ProseMirror plugin that draws the misspelling underline
 * (spell-checker FR-25, FR-35, AC-12). It draws only from ranges it is given
 * and never checks text itself; Task 36 wires worker results into it.
 *
 * ## Pushing results (Task 36)
 *
 * Dispatch a transaction carrying a {@link SpellCheckMeta} under
 * {@link SPELL_CHECK_DECORATION_KEY}:
 * - `{ type: "set", version, ranges }` replaces the underlines. `version`
 *   must be the value of {@link getSpellDocVersion} read when the check was
 *   requested; if the document has changed since, the plugin ignores the
 *   result (its positions no longer describe the document) and the caller
 *   re-checks. Empty, inverted or out-of-document ranges are skipped.
 * - `{ type: "clear" }` removes all underlines.
 * - `{ type: "refresh" }` re-reads `isEnabled()`; send it when the switch or
 *   the checker's availability changes. Turning off empties the set at once.
 *
 * ## Mapping
 *
 * Document-changing transactions bump the version and map the existing
 * decorations through the edit, so underlines follow the text until a fresh
 * result replaces them.
 *
 * ## No work when off (FR-35)
 *
 * While `isEnabled()` is false the plugin state is `DecorationSet.empty`;
 * `set` results are not built and nothing is retained.
 *
 * The plugin only ever produces `Decoration.inline`; it never changes the
 * document, never triggers `onUpdate`, and reads or writes no sidecar, index
 * or file.
 */

/** CSS class on a misspelled word; styled in `styles/editor.css`. */
export const SPELL_CHECK_CLASS = "spell-error";

/** A flagged range in document positions. */
export interface SpellRange {
  from: number;
  to: number;
}

export type SpellCheckMeta =
  | { type: "set"; version: number; ranges: SpellRange[] }
  | { type: "clear" }
  | { type: "refresh" };

interface SpellCheckPluginState {
  decorations: DecorationSet;
  /** Count of document-changing transactions seen. */
  docVersion: number;
}

export interface SpellCheckDecorationOptions {
  /**
   * Whether underlines may be drawn: the switch is on and the checker is
   * active (see {@link isSpellCheckActive}). Read through a ref-backed getter
   * on every transaction so toggling does not recreate the editor.
   */
  isEnabled: () => boolean;
}

export const SPELL_CHECK_DECORATION_KEY = new PluginKey<SpellCheckPluginState>(
  "spellCheckDecoration",
);

/**
 * True only when the user's switch is on and the checker is `active` (lists
 * and alias table loaded, engine up, browser supported).
 */
export function isSpellCheckActive(
  switchEnabled: boolean,
  checker: SpellCheckerState,
): boolean {
  return switchEnabled && checker.status === "active";
}

/** The document version a check request must carry back with its result. */
export function getSpellDocVersion(state: EditorState): number {
  return SPELL_CHECK_DECORATION_KEY.getState(state)?.docVersion ?? 0;
}

function buildDecorations(
  doc: ProseMirrorNode,
  ranges: SpellRange[],
): DecorationSet {
  const size = doc.content.size;
  const decorations = ranges
    .filter(
      (r) =>
        r.from >= 1 &&
        r.from < r.to &&
        r.to <= size &&
        doc.resolve(r.from).parent.inlineContent &&
        doc.resolve(r.to).parent.inlineContent,
    )
    .map((r) => Decoration.inline(r.from, r.to, { class: SPELL_CHECK_CLASS }));
  return decorations.length === 0
    ? DecorationSet.empty
    : DecorationSet.create(doc, decorations);
}

/**
 * Underlines misspelled words from supplied ranges. See the module comment
 * for the meta protocol.
 */
const SpellCheckDecorationExtension =
  Extension.create<SpellCheckDecorationOptions>({
    name: "spellCheckDecoration",

    addOptions(): SpellCheckDecorationOptions {
      return { isEnabled: () => false };
    },

    addProseMirrorPlugins() {
      const { isEnabled } = this.options;

      return [
        new Plugin<SpellCheckPluginState>({
          key: SPELL_CHECK_DECORATION_KEY,
          state: {
            init: () => ({ decorations: DecorationSet.empty, docVersion: 0 }),
            apply: (tr, old) => {
              const docVersion = old.docVersion + (tr.docChanged ? 1 : 0);
              if (!isEnabled()) {
                return old.decorations === DecorationSet.empty &&
                  docVersion === old.docVersion
                  ? old
                  : { decorations: DecorationSet.empty, docVersion };
              }
              const meta = tr.getMeta(SPELL_CHECK_DECORATION_KEY) as
                | SpellCheckMeta
                | undefined;
              if (meta?.type === "clear") {
                return { decorations: DecorationSet.empty, docVersion };
              }
              if (meta?.type === "set" && meta.version === docVersion) {
                return {
                  decorations: buildDecorations(tr.doc, meta.ranges),
                  docVersion,
                };
              }
              if (tr.docChanged) {
                return {
                  decorations: old.decorations.map(tr.mapping, tr.doc),
                  docVersion,
                };
              }
              return old;
            },
          },
          props: {
            decorations(state) {
              return SPELL_CHECK_DECORATION_KEY.getState(state)?.decorations;
            },
          },
        }),
      ];
    },
  });

export default SpellCheckDecorationExtension;
