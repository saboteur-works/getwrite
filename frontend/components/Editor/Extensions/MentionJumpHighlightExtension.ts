import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

/**
 * @module MentionJumpHighlightExtension
 *
 * Task 3 (`specs/features/entity-mention-navigation.md`, FR-8): new, dedicated
 * TipTap decoration infrastructure for the one-shot "landed here" flash shown
 * after a writer clicks a mention snippet and the editor selection jumps to
 * the resolved position (Task 11/12 wire the actual click-to-jump flow; this
 * module only supplies the decoration mechanism itself).
 *
 * This is deliberately a *separate* module from
 * `./EntityHighlightDecorationExtension.ts` and imports nothing from it (and
 * is imported by nothing in it) — FR-8 explicitly prohibits reusing or
 * extending that extension for this purpose. The two serve materially
 * different purposes and have materially different lifecycles:
 *
 * - `EntityHighlightDecorationExtension` is **persistent**: its
 *   `DecorationSet` is continuously recomputed from the live document on
 *   every document-changing transaction (and on an explicit recompute
 *   signal), for as long as entity highlighting is enabled. It marks every
 *   occurrence of every declared entity's name/alias.
 * - `MentionJumpHighlightExtension` is **one-shot**: a caller explicitly sets
 *   a single decoration over a given `{ from, to }` span via
 *   {@link applyMentionJumpHighlight}, and that decoration is cleared exactly
 *   once by a timer after a caller-supplied duration — there is no polling
 *   and no continuous recomputation. Nothing about a normal document edit
 *   clears it early or extends it; only the timer (or a fresh call to
 *   {@link applyMentionJumpHighlight}, which replaces whatever flash is
 *   currently showing) changes the decoration.
 */

/** Plugin key, exported so a host component or test can read plugin state directly. */
export const MENTION_JUMP_HIGHLIGHT_KEY = new PluginKey("mentionJumpHighlight");

/** CSS class applied to the transient jump-highlight decoration. */
export const MENTION_JUMP_HIGHLIGHT_CLASS = "mention-jump-highlight";

/** Meta value dispatched to clear the flash — distinct from a `{ from, to }` set-span meta. */
const CLEAR_META = "clear" as const;

type MentionJumpHighlightMeta =
  | { from: number; to: number }
  | typeof CLEAR_META;

/**
 * Decorates the given `{ from, to }` span of a `DecorationSet` built fresh
 * (ignoring whatever was there before — a new flash always replaces an
 * in-flight one rather than stacking).
 */
function buildSpanDecoration(
  doc: Parameters<typeof DecorationSet.create>[0],
  from: number,
  to: number,
): DecorationSet {
  return DecorationSet.create(doc, [
    Decoration.inline(from, to, { class: MENTION_JUMP_HIGHLIGHT_CLASS }),
  ]);
}

/**
 * One-shot transient highlight decoration, with no continuous recomputation:
 * the plugin's `DecorationSet` state only ever changes in response to an
 * explicit meta transaction (`{ from, to }` to set, `"clear"` to clear) —
 * never in response to `tr.docChanged` alone, since this decoration is not a
 * function of document content the way `EntityHighlightDecorationExtension`'s
 * is. A plain document edit while the flash is showing leaves it exactly
 * where it was (ProseMirror's own transaction mapping still relocates the
 * decoration if the edit happens before/within its span, since the state is
 * rebuilt from `tr.mapping` on every transaction, not just on a meta one).
 */
const MentionJumpHighlightExtension = Extension.create({
  name: "mentionJumpHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: MENTION_JUMP_HIGHLIGHT_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(MENTION_JUMP_HIGHLIGHT_KEY) as
              | MentionJumpHighlightMeta
              | undefined;
            if (meta === CLEAR_META) return DecorationSet.empty;
            if (meta) return buildSpanDecoration(tr.doc, meta.from, meta.to);
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

export default MentionJumpHighlightExtension;

/**
 * Tracks the single in-flight clear timer across calls to
 * {@link applyMentionJumpHighlight}, module-scoped because only one flash can
 * ever be showing at a time (the decoration set has a single slot — see
 * {@link buildSpanDecoration}). Without this, calling the function again
 * before an earlier call's timer fires replaces the *decoration* (a fresh
 * flash) but leaves the earlier call's own `setTimeout` running; that stale
 * timer still unconditionally clears on its own original schedule, cutting
 * the new flash short at "time of the earlier click + its duration" rather
 * than letting it run its own full duration. Clearing the previous timer
 * before scheduling a new one — exactly what a second real click on a
 * mention snippet does — is what makes "a fresh jump always shows its own
 * full duration" (the behavior this module has always documented) actually
 * true.
 */
let pendingClearTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Applies the one-shot transient highlight: dispatches a transaction setting
 * a decoration over `{ from, to }` on `view`'s current state, then schedules
 * a single `setTimeout` (no polling/interval) that, after `durationMs`
 * milliseconds, dispatches a second transaction clearing it. Calling this
 * again before the timer fires cancels the still-pending previous timer (see
 * {@link pendingClearTimer}) and replaces the currently-showing flash with
 * the new one, so the new flash always runs its own full duration rather
 * than being cut short by a leftover clear scheduled against an earlier
 * call.
 */
export function applyMentionJumpHighlight(
  view: Pick<EditorView, "state" | "dispatch">,
  span: { from: number; to: number },
  durationMs: number,
): void {
  if (pendingClearTimer !== null) {
    clearTimeout(pendingClearTimer);
    pendingClearTimer = null;
  }

  view.dispatch(
    view.state.tr.setMeta(MENTION_JUMP_HIGHLIGHT_KEY, {
      from: span.from,
      to: span.to,
    }),
  );

  pendingClearTimer = setTimeout(() => {
    pendingClearTimer = null;
    view.dispatch(
      view.state.tr.setMeta(MENTION_JUMP_HIGHLIGHT_KEY, CLEAR_META),
    );
  }, durationMs);
}
