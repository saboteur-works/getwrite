/**
 * @module compile-defaults-selection
 *
 * Pure initial-selection logic for the compile and export dialogs (Feature
 * 101, FR-4, FR-6). Shared by both dialogs. Names no resource kind or type:
 * every id is treated alike.
 */

/** Result of resolving saved exclusions against the current resource ids. */
export interface InitialSelection {
  /** Every selectable id except those left out by the saved default. */
  selectedIds: Set<string>;
  /** Saved excluded ids that still exist, in saved order. */
  leftOutIds: string[];
}

/**
 * Resolves the dialog's initial selection.
 *
 * Saved ids that name no current resource are dropped silently. Nothing is
 * written back: this function has no side effects.
 *
 * @param selectableIds - Ids the dialog can select, in display order.
 * @param savedExcludedIds - The saved excluded list; `undefined` means no
 *   saved default, so everything is selected.
 */
export function resolveInitialSelection(
  selectableIds: Iterable<string>,
  savedExcludedIds: readonly string[] | undefined,
): InitialSelection {
  const all = [...selectableIds];
  const existing = new Set(all);
  const leftOutIds: string[] = [];
  const leftOut = new Set<string>();
  for (const id of savedExcludedIds ?? []) {
    if (existing.has(id) && !leftOut.has(id)) {
      leftOut.add(id);
      leftOutIds.push(id);
    }
  }
  return {
    selectedIds: new Set(all.filter((id) => !leftOut.has(id))),
    leftOutIds,
  };
}
