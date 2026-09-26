import React from "react";
import {
  getTodayWritingLog,
  type WritingLogAggregate,
} from "../../src/lib/api/writing-log";
import {
  getEditFooterExpanded,
  setEditFooterExpanded,
} from "../../src/lib/edit-footer-state";
import {
  getWritingLogSessionIncomplete,
  subscribeWritingLogSessionIncomplete,
} from "../../src/lib/writing-log-signal";

export interface WritingLogFooterDisplayProps {
  /** On-disk project directory id; when null nothing is fetched or rendered. */
  projectId: string | null;
  /**
   * Opaque value that triggers a refetch when it changes (EditView passes the
   * last-saved timestamp, so the figure refreshes after each save settles).
   * The aggregate is also fetched on mount and when `projectId` changes.
   */
  refreshToken?: string | number | null;
}

type FetchState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; projectId: string; aggregate: WritingLogAggregate };

const REGION_ID = "editview-writing-log-details";

/**
 * Collapsed-by-default footer disclosure for today's writing versus the daily
 * goal (Feature 59, FR-7/FR-8). Neutral colour only; a failed read renders as
 * an explicit "unavailable" message, never as zero.
 */
export default function WritingLogFooterDisplay({
  projectId,
  refreshToken = null,
}: WritingLogFooterDisplayProps): JSX.Element | null {
  const [isExpanded, setIsExpanded] = React.useState<boolean>(() =>
    getEditFooterExpanded(),
  );
  const [state, setState] = React.useState<FetchState>({ kind: "loading" });
  const hasSessionIncomplete = React.useSyncExternalStore(
    subscribeWritingLogSessionIncomplete,
    getWritingLogSessionIncomplete,
    () => false,
  );

  React.useEffect(() => {
    if (!projectId) return;
    let isCancelled = false;
    getTodayWritingLog(projectId)
      .then((aggregate) => {
        if (!isCancelled) setState({ kind: "ready", projectId, aggregate });
      })
      .catch(() => {
        if (!isCancelled) setState({ kind: "error" });
      });
    return () => {
      isCancelled = true;
    };
  }, [projectId, refreshToken]);

  if (!projectId) return null;

  const toggle = (): void => {
    const isNextExpanded = !isExpanded;
    setIsExpanded(isNextExpanded);
    setEditFooterExpanded(isNextExpanded);
  };

  // A result belonging to a previously open project is treated as not yet loaded.
  const aggregate =
    state.kind === "ready" && state.projectId === projectId
      ? state.aggregate
      : null;
  const isIncomplete = (aggregate?.incomplete ?? false) || hasSessionIncomplete;

  let summary: string;
  if (state.kind === "error") {
    summary = "Today's count is unavailable";
  } else if (aggregate) {
    summary =
      aggregate.goal === undefined
        ? `Today: ${aggregate.totals.net}`
        : `Today: ${aggregate.totals.net} / ${aggregate.goal}`;
  } else {
    summary = "Today: …";
  }

  return (
    <div className="flex items-center gap-2 text-gw-secondary text-gw-small">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={REGION_ID}
        className="font-medium text-gw-primary hover:text-gw-secondary"
        onClick={toggle}
      >
        Today&apos;s writing
      </button>
      <span>{summary}</span>
      {isIncomplete && <span>Today&apos;s count may be incomplete</span>}
      <div
        id={REGION_ID}
        role="region"
        aria-label="Today's writing details"
        hidden={!isExpanded}
      >
        {isExpanded && aggregate && (
          <span className="flex items-center gap-3">
            <span>Added: {aggregate.totals.added}</span>
            <span>Deleted: {aggregate.totals.deleted}</span>
            <span>Net: {aggregate.totals.net}</span>
            <span>
              Imported (not counted toward goal): {aggregate.imported.net}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
