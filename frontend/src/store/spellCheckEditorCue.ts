/**
 * @module spellCheckEditorCue
 *
 * What the editor footer says about the spell checker (Feature 96, spec
 * FR-24). A paused or partly applied checker draws no underline and, without
 * a cue, nothing in the editor says why. Pure derivation over
 * `selectSpellCheckerState` and `selectUserWordsNotApplied`, so the cue can
 * not disagree with App Settings. The spelling switch is not an input here;
 * the component shows nothing while it is off.
 *
 * - `paused`: an unavailable reason (lists, alias table, user list, engine or
 *   browser). `message` is the reason text the slice already produced.
 * - `notApplied`: the checker is active but runs without the writer's own
 *   words ("Continue without my dictionary").
 * - `null`: active, or only loading (loading is not a failure).
 */
import { createSelector } from "@reduxjs/toolkit";
import {
  selectSpellCheckerState,
  selectUserWordsNotApplied,
  type SpellCheckerState,
} from "./spellingAvailabilitySlice";

export type SpellCheckEditorCue =
  | { kind: "paused"; message: string }
  | { kind: "notApplied" };

export function deriveSpellCheckEditorCue(
  checker: SpellCheckerState,
  userWordsNotApplied: boolean,
): SpellCheckEditorCue | null {
  if (checker.status === "paused") {
    const failure = checker.reasons.find((r) => r.kind !== "loading");
    return failure ? { kind: "paused", message: failure.message } : null;
  }
  return userWordsNotApplied ? { kind: "notApplied" } : null;
}

export const selectSpellCheckEditorCue = createSelector(
  [selectSpellCheckerState, selectUserWordsNotApplied],
  deriveSpellCheckEditorCue,
);
