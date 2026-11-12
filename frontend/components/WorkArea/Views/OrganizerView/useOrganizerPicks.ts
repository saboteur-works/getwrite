"use client";

import React from "react";
import type {
  OrganizerArrangementResult,
  OrganizerAxis,
  OrganizerSource,
} from "../../../../src/lib/models/organizer-grid-types";
import {
  useOrganizerArrangements,
  type OrganizerArrangementOutcome,
  type OrganizerPicks,
  type UseOrganizerArrangementsResult,
} from "./useOrganizerArrangements";

/**
 * @module useOrganizerPicks
 * The Organizer's arrangement picks (source, Rows, Columns) and the saved
 * arrangements wired to them (Feature 109, FR-3, FR-14 to FR-16). Local state
 * here; applying a saved arrangement sets source, rows and columns only, and
 * the filters are never touched. A folder source follows the browsed folder
 * live unless pinned, which applying a saved folder source does.
 */

const DEFAULT_SOURCE: OrganizerSource = {
  kind: "folder",
  folderId: "",
  scope: "children",
};

/** Adapts the hook's outcome to the controls' result type; the controls show only `message`. */
export function asArrangementResult(
  outcome: OrganizerArrangementOutcome,
): OrganizerArrangementResult<{ id: string }> {
  return outcome.ok
    ? outcome
    : { ok: false, reason: "invalid-input", message: outcome.message };
}

export interface UseOrganizerPicksResult {
  /** The source with a followed folder resolved to the browsed one. */
  effectiveSource: OrganizerSource;
  rowsAxis: OrganizerAxis;
  columnsAxis: OrganizerAxis;
  setRowsAxis: (axis: OrganizerAxis) => void;
  setColumnsAxis: (axis: OrganizerAxis) => void;
  /** A source chosen in the toolbar: unpinned, so a folder source follows browsing. */
  chooseSource: (source: OrganizerSource) => void;
  arrangements: UseOrganizerArrangementsResult;
  /** Applies an arrangement (`null` = Default) and records a refusal as text. */
  selectArrangement: (id: string | null) => void;
  /** The refusal text of the latest apply, or `null`. */
  arrangementMessage: string | null;
}

/**
 * @param browsedFolderId - The folder being browsed, `""` when none.
 */
export function useOrganizerPicks(
  browsedFolderId: string,
): UseOrganizerPicksResult {
  const [source, setSource] = React.useState<OrganizerSource>(DEFAULT_SOURCE);
  const [isSourcePinned, setIsSourcePinned] = React.useState(false);
  const [rowsAxis, setRowsAxis] = React.useState<OrganizerAxis>("none");
  const [columnsAxis, setColumnsAxis] = React.useState<OrganizerAxis>("order");
  const [arrangementMessage, setArrangementMessage] = React.useState<
    string | null
  >(null);

  const effectiveSource: OrganizerSource = React.useMemo(
    () =>
      source.kind === "folder" && !isSourcePinned
        ? { ...source, folderId: browsedFolderId }
        : source,
    [source, isSourcePinned, browsedFolderId],
  );
  const current: OrganizerPicks = React.useMemo(
    () => ({ source: effectiveSource, rows: rowsAxis, columns: columnsAxis }),
    [effectiveSource, rowsAxis, columnsAxis],
  );
  const defaultPicks: OrganizerPicks = React.useMemo(
    () => ({
      source: { ...DEFAULT_SOURCE, folderId: browsedFolderId },
      rows: "none",
      columns: "order",
    }),
    [browsedFolderId],
  );
  const onApply = React.useCallback((picks: OrganizerPicks) => {
    setSource(picks.source);
    setIsSourcePinned(
      picks.source.kind === "folder" && picks.source.folderId !== "",
    );
    setRowsAxis(picks.rows);
    setColumnsAxis(picks.columns);
  }, []);
  const arrangements = useOrganizerArrangements({
    current,
    defaultPicks,
    onApply,
  });
  const selectArrangement = (id: string | null): void => {
    const outcome = arrangements.apply(id);
    setArrangementMessage(outcome.ok ? null : outcome.message);
  };
  const chooseSource = React.useCallback((next: OrganizerSource): void => {
    setSource(next);
    setIsSourcePinned(false);
  }, []);

  return {
    effectiveSource,
    rowsAxis,
    columnsAxis,
    setRowsAxis,
    setColumnsAxis,
    chooseSource,
    arrangements,
    selectArrangement,
    arrangementMessage,
  };
}
