"use client";

import React from "react";
import { Tooltip } from "react-tooltip";
import { TOOLTIP_STYLE } from "../common/UI/tooltipStyle";

/**
 * Props accepted by {@link NodeTypeIndicator}.
 */
export interface NodeTypeIndicatorProps {
  /**
   * Distinct node-type labels for the current selection, in document order
   * (e.g. `["Heading 2", "Body"]`). An empty array renders the neutral
   * placeholder.
   */
  types: string[];
  /**
   * Maximum number of labels rendered inline before collapsing the remainder
   * into a `+N` summary. The full list is always available via the tooltip.
   * Defaults to 3. Values below 1 are treated as 1.
   */
  maxVisibleTypes?: number;
  /** Optional extra classes applied to the root element. */
  className?: string;
}

/** Neutral placeholder shown when no node is under the cursor. */
const PLACEHOLDER = "—";

/**
 * Footer indicator that displays the node type(s) at the current editor
 * selection, mirroring the adjacent word-count styling.
 *
 * Behavior:
 * - One label for a caret in a single node (e.g. "Heading 2").
 * - A comma-joined list for a selection spanning multiple node types.
 * - Past `maxVisibleTypes`, the inline list is truncated to a `+N` summary and
 *   the complete list is exposed on hover (a `react-tooltip` surface) and to
 *   assistive technology via `aria-label`.
 * - A neutral `—` placeholder when `types` is empty (no resource / no cursor).
 *
 * Purely presentational and read-only: it never mutates editor state.
 *
 * @example
 * <NodeTypeIndicator types={["Heading 2"]} />
 */
export default function NodeTypeIndicator({
  types,
  maxVisibleTypes = 3,
  className = "",
}: NodeTypeIndicatorProps): JSX.Element {
  const cap = Math.max(1, maxVisibleTypes);
  const isEmpty = types.length === 0;
  const isTruncated = types.length > cap;

  const fullList = types.join(", ");
  const display = isEmpty
    ? PLACEHOLDER
    : isTruncated
      ? `${types.slice(0, cap).join(", ")} +${types.length - cap}`
      : fullList;

  // A stable, unique anchor id so multiple indicators never share a tooltip.
  const tooltipId = React.useId();

  return (
    <div
      data-testid="node-type-indicator"
      className={`text-gw-secondary text-gw-small ${className}`.trimEnd()}
    >
      Node:{" "}
      <strong
        data-tooltip-id={isTruncated ? tooltipId : undefined}
        data-tooltip-content={isTruncated ? fullList : undefined}
        // Expose the full list to assistive tech when the inline text is
        // incomplete (placeholder gets its own descriptive label).
        aria-label={
          isEmpty ? "No node selected" : isTruncated ? fullList : undefined
        }
      >
        {display}
      </strong>
      {isTruncated ? (
        <Tooltip id={tooltipId} place="top" style={TOOLTIP_STYLE} />
      ) : null}
    </div>
  );
}
