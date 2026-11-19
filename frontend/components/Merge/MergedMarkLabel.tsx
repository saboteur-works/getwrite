import React from "react";
import { MERGED_TREE_LABEL_RULE } from "../../src/lib/models/merge-messages";
import type { MergedMarkView } from "./useMergedMarkState";

export interface MergedMarkLabelProps {
  /** What the mark says now: the state and its label from `merge-messages.ts`. */
  view: MergedMarkView;
  /** Id of the visually hidden rule text; the tree row names it with `aria-describedby`. */
  ruleId: string;
}

/**
 * The merged mark in a tree row (Feature 121, FR-16): visible text that names
 * the target when it can be named, or states why it cannot. It is text, not
 * colour or an icon alone, and uses no red. The one-line rule is visually
 * hidden and read as the row's description. No control here clears the mark.
 */
export default function MergedMarkLabel({
  view,
  ruleId,
}: MergedMarkLabelProps): JSX.Element {
  return (
    <>
      <span
        data-testid="merged-mark-label"
        data-state={view.state}
        title={view.label}
        className="resource-tree-merged-mark ml-2 min-w-0 truncate text-gw-label text-fg-tertiary italic"
      >
        {view.label}
      </span>
      <span id={ruleId} className="sr-only">
        {MERGED_TREE_LABEL_RULE}
      </span>
    </>
  );
}
