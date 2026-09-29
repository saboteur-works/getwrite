import React from "react";
import {
  NO_STATUS_FILTER_VALUE,
  type OrganizerFilterAction,
  type OrganizerFilterState,
} from "./organizerFilters";

/**
 * @module OrganizerFilterBar
 * Filter bar rendered above the Organizer view's card grid (see
 * `specs/features/organizer-card-filtering.md`). Currently holds the Status
 * filter control (FR-1, FR-2); later tasks add word-count and resource-ref
 * controls to the same bar. Purely presentational — all filter-state
 * transitions are dispatched via `OrganizerFilterAction`s and evaluated by
 * `organizerFilters.ts`'s `filterChildren`.
 */

/** Sentinel `<select>` option value representing "no status filter active". */
const ALL_STATUSES_VALUE = "";

/** Props accepted by {@link OrganizerFilterBar}. */
export interface OrganizerFilterBarProps {
  /** Current Organizer filter selections. */
  filterState: OrganizerFilterState;
  /** Dispatch function for the Organizer filter reducer. */
  dispatchFilter: React.Dispatch<OrganizerFilterAction>;
  /** The active project's configured statuses (`config.statuses`), in order. */
  statuses: string[];
}

/**
 * Filter bar for the Organizer view's card grid. Renders the Status filter
 * control: a labelled `<select>` populated with "All statuses", each
 * configured status, and "No status" (FR-1). Selecting a value dispatches
 * `set-status` so `OrganizerView` re-filters the visible card set (FR-2).
 */
export default function OrganizerFilterBar({
  filterState,
  dispatchFilter,
  statuses,
}: OrganizerFilterBarProps): JSX.Element {
  const selectValue = filterState.status ?? ALL_STATUSES_VALUE;

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    dispatchFilter({
      type: "set-status",
      value: value === ALL_STATUSES_VALUE ? undefined : value,
    });
  };

  return (
    <div className="flex items-center gap-3 mb-4">
      <label
        htmlFor="organizer-status-filter"
        className="text-xs text-gw-secondary"
      >
        Status
      </label>
      <select
        id="organizer-status-filter"
        aria-label="Filter by status"
        value={selectValue}
        onChange={handleStatusChange}
        className="p-2 border border-gw-border bg-gw-chrome2 px-3 py-1.5 text-sm text-gw-primary outline-none transition-colors duration-150 focus:border-gw-border-md"
      >
        <option value={ALL_STATUSES_VALUE}>All statuses</option>
        {statuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
        <option value={NO_STATUS_FILTER_VALUE}>No status</option>
      </select>
    </div>
  );
}
