"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getGoalFilteredTotal,
  type GoalFilteredTotalResult,
} from "../lib/api/goal-filtered-total";
import {
  getWritingLogGoalVersion,
  subscribeWritingLogGoalVersion,
} from "../lib/writing-log-signal";

/**
 * @module useFilteredGoalTotal
 *
 * **Feature 98, Task 15 (FR-9, FR-14).** Reads the writing-goal filtered
 * total through the Task 8 transport.
 *
 * - With no filter set, no request is made and the state is `not-filtered`.
 * - With a filter set, the state is `loading`, then the transport's result
 *   (`total`, `no-match` or `unavailable`).
 * - A rejected request becomes `unavailable` (reason `request-failed`), never
 *   a number (`docs/standards/failure-visibility.md`).
 * - The read repeats on mount, when the filter turns on, and on the existing
 *   goal-change signal (`notifyWritingLogGoalChanged`), so trashed, restored,
 *   copied or edited documents are reflected without reloading the project.
 *   A response that arrives after a newer read started is discarded.
 *
 * Writes nothing to the Redux store (`querySlice` is untouched).
 */

type FilteredGoalTotalState =
  | GoalFilteredTotalResult
  | { status: "loading" }
  | { status: "unavailable"; reason: "request-failed" };

export interface FilteredGoalTotal {
  state: FilteredGoalTotalState;
  isFiltered: boolean;
  isLoading: boolean;
  isNoMatch: boolean;
  isUnavailable: boolean;
}

const NOT_FILTERED: FilteredGoalTotalState = { status: "not-filtered" };
const LOADING: FilteredGoalTotalState = { status: "loading" };
const REQUEST_FAILED: FilteredGoalTotalState = {
  status: "unavailable",
  reason: "request-failed",
};

/**
 * @param projectId Active project id.
 * @param isFilterSet Whether `config.goalFilter` is set; when false no
 *   request is made.
 */
export function useFilteredGoalTotal(
  projectId: string,
  isFilterSet: boolean,
): FilteredGoalTotal {
  const goalVersion = useSyncExternalStore(
    subscribeWritingLogGoalVersion,
    getWritingLogGoalVersion,
    getWritingLogGoalVersion,
  );
  const [result, setResult] = useState<FilteredGoalTotalState>(LOADING);

  useEffect(() => {
    if (!isFilterSet) return;
    let isCurrent = true;
    setResult(LOADING);
    getGoalFilteredTotal(projectId).then(
      (next) => {
        if (isCurrent) setResult(next);
      },
      () => {
        if (isCurrent) setResult(REQUEST_FAILED);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [projectId, isFilterSet, goalVersion]);

  const state = isFilterSet ? result : NOT_FILTERED;
  return {
    state,
    isFiltered: state.status !== "not-filtered",
    isLoading: state.status === "loading",
    isNoMatch: state.status === "no-match",
    isUnavailable: state.status === "unavailable",
  };
}
