"use client";

import { useCallback, useEffect, useRef } from "react";
import { toastService } from "../../../../src/lib/toast-service";
import type { OrganizerSmartFolderState } from "./useOrganizerSmartFolderCards";

/**
 * @module useOrganizerSmartDropFollowUp
 *
 * **Feature 109 (FR-9, FR-11).** What a saved drop in a smart-folder source
 * owes once the source has been re-evaluated: the grid shows a loading state
 * while it re-reads, so the moved card is not in the document until the new
 * ids arrive. This hook holds the dropped card until then, and then
 *
 * - card still matches: hands focus to its drag handle (`focusCard`);
 * - card no longer matches: it has left the grid, so a toast says it left the
 *   smart folder (focus has nowhere to go and is not moved);
 * - the re-evaluation failed or the folder is gone: nothing here; the source's
 *   own failed or deleted state already says so.
 */
export interface UseOrganizerSmartDropFollowUpOptions {
  state: OrganizerSmartFolderState;
  focusCard: (cardId: string) => void;
}

interface PendingDrop {
  cardId: string;
  name: string;
  /** The state object current when the drop was saved; a result must differ. */
  before: OrganizerSmartFolderState;
}

export function leftSmartFolderMessage(name: string): string {
  return `${name} left the smart folder because it no longer matches.`;
}

/** Returns `begin(cardId, name)`, to call once after a saved drop. */
export function useOrganizerSmartDropFollowUp(
  options: UseOrganizerSmartDropFollowUpOptions,
): (cardId: string, name: string) => void {
  const { state, focusCard } = options;
  const pending = useRef<PendingDrop | null>(null);
  const latest = useRef(state);
  latest.current = state;

  const begin = useCallback((cardId: string, name: string): void => {
    pending.current = { cardId, name, before: latest.current };
  }, []);

  useEffect(() => {
    const drop = pending.current;
    if (!drop || state === drop.before) return;
    if (state.status === "ready") {
      pending.current = null;
      if (state.ids.includes(drop.cardId)) focusCard(drop.cardId);
      else toastService.info(leftSmartFolderMessage(drop.name));
    } else if (state.status !== "loading") {
      pending.current = null;
    }
  }, [state, focusCard]);

  return begin;
}
