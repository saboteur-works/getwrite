"use client";

import { useAppSelector } from "../store/hooks";
import {
  selectSpellCheckerState,
  selectUserWordsNotApplied,
} from "../store/spellingAvailabilitySlice";
import { useSpellcheckEnabled } from "./useSpellcheckEnabled";

/**
 * Whether the App Settings Spell check section is currently showing the
 * failed-read line with Retry (`SpellcheckSetting`, FR-16). It shows it only
 * while the switch is on, the list applies, and the writer has not chosen
 * "Continue without my dictionary". "My dictionary" uses this to avoid
 * repeating the failure, and keeps its own Retry whenever this is false.
 */
export function useUserListFailureShownInSpellCheck(): boolean {
  const [isEnabled] = useSpellcheckEnabled();
  const checker = useAppSelector(selectSpellCheckerState);
  const isNotApplied = useAppSelector(selectUserWordsNotApplied);
  return (
    isEnabled &&
    !isNotApplied &&
    checker.status === "paused" &&
    checker.reasons.some((reason) => reason.kind === "user-list-failed")
  );
}
