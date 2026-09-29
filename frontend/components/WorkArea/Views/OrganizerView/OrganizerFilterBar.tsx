import React from "react";
import { X } from "lucide-react";
import type { MetadataField } from "../../../../src/lib/models/types";
import Button from "../../../common/UI/Button";
import {
  NO_STATUS_FILTER_VALUE,
  type OrganizerFilterAction,
  type OrganizerFilterState,
} from "./organizerFilters";

/**
 * @module OrganizerFilterBar
 * Filter bar rendered above the Organizer view's card grid (see
 * `specs/features/organizer-card-filtering.md`). Holds the Status filter
 * control (FR-1, FR-2), the free-form min/max word-count range filter
 * (FR-3, FR-4), one dropdown per `resource-ref`/`multi-resource-ref`
 * metadata field defined on the active project (FR-5, FR-6), and a
 * per-filter clear control plus a "Clear all filters" control (FR-8).
 * Purely presentational — all filter-state transitions are dispatched via
 * `OrganizerFilterAction`s and evaluated by `organizerFilters.ts`'s
 * `filterChildren`.
 */

/** Parses a number-input's string value to `number | undefined`, treating "" and NaN as inactive. */
function parseWordCountInput(value: string): number | undefined {
  if (value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Sentinel `<select>` option value representing "no status filter active". */
const ALL_STATUSES_VALUE = "";

/** Sentinel `<select>` option value representing "no ref filter active" for a given field. */
const ALL_REF_VALUES_VALUE = "";

/** Props accepted by {@link OrganizerFilterBar}. */
export interface OrganizerFilterBarProps {
  /** Current Organizer filter selections. */
  filterState: OrganizerFilterState;
  /** Dispatch function for the Organizer filter reducer. */
  dispatchFilter: React.Dispatch<OrganizerFilterAction>;
  /** The active project's configured statuses (`config.statuses`), in order. */
  statuses: string[];
  /**
   * Every `resource-ref`/`multi-resource-ref` field defined anywhere in the
   * active project's metadata schema (FR-5). One filter control is rendered
   * per field; an empty array renders none.
   */
  refFields: MetadataField[];
  /**
   * Distinct referenced-resource names present among the current folder's
   * direct children, keyed by `refFields[].key` (FR-5). Populates each
   * field's control options.
   */
  refFieldValues: Record<string, string[]>;
  /**
   * Whether the filter area itself is expanded (FR-12). Session-only state
   * owned by `OrganizerView`, deliberately kept separate from
   * `OrganizerFilterState`/`organizerFilters.ts`'s reducer so it is never
   * reset alongside filter values. Not yet consumed by any rendering here —
   * wiring only, pending Task 13.
   */
  isFilterAreaOpen: boolean;
  /** Setter for {@link isFilterAreaOpen}. */
  setIsFilterAreaOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /**
   * Whether the advanced-filters disclosure nested within the filter area is
   * expanded (FR-14). Session-only state owned by `OrganizerView`, same
   * rationale as {@link isFilterAreaOpen}. Not yet consumed by any rendering
   * here — wiring only, pending Task 14.
   */
  isAdvancedFiltersOpen: boolean;
  /** Setter for {@link isAdvancedFiltersOpen}. */
  setIsAdvancedFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
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
  refFields,
  refFieldValues,
  isFilterAreaOpen: _isFilterAreaOpen,
  setIsFilterAreaOpen: _setIsFilterAreaOpen,
  isAdvancedFiltersOpen: _isAdvancedFiltersOpen,
  setIsAdvancedFiltersOpen: _setIsAdvancedFiltersOpen,
}: OrganizerFilterBarProps): JSX.Element {
  const selectValue = filterState.status ?? ALL_STATUSES_VALUE;

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    dispatchFilter({
      type: "set-status",
      value: value === ALL_STATUSES_VALUE ? undefined : value,
    });
  };

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatchFilter({
      type: "set-word-count-range",
      min: parseWordCountInput(e.target.value),
      max: filterState.wordCountMax,
    });
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatchFilter({
      type: "set-word-count-range",
      min: filterState.wordCountMin,
      max: parseWordCountInput(e.target.value),
    });
  };

  const handleRefFilterChange = (
    fieldKey: string,
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const value = e.target.value;
    dispatchFilter({
      type: "set-ref-filter",
      fieldKey,
      value: value === ALL_REF_VALUES_VALUE ? undefined : value,
    });
  };

  const handleClearStatus = () => {
    dispatchFilter({ type: "clear-one", key: "status" });
  };

  const handleClearWordCount = () => {
    dispatchFilter({ type: "clear-one", key: "wordCount" });
  };

  const handleClearRefFilter = (fieldKey: string) => {
    dispatchFilter({ type: "clear-one", key: { refFieldKey: fieldKey } });
  };

  const handleClearAll = () => {
    dispatchFilter({ type: "clear-all" });
  };

  const isStatusActive = filterState.status !== undefined;
  const isWordCountActive =
    filterState.wordCountMin !== undefined ||
    filterState.wordCountMax !== undefined;
  const isAnyFilterActive =
    isStatusActive ||
    isWordCountActive ||
    Object.values(filterState.refFilters).some((value) => value !== undefined);

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
      {isStatusActive && (
        <button
          type="button"
          aria-label="Clear status filter"
          onClick={handleClearStatus}
          className="text-gw-secondary hover:text-gw-primary"
        >
          <X size={14} />
        </button>
      )}

      <label
        htmlFor="organizer-word-count-min-filter"
        className="text-xs text-gw-secondary"
      >
        Minimum words
      </label>
      <input
        id="organizer-word-count-min-filter"
        aria-label="Minimum words"
        type="number"
        min={0}
        value={filterState.wordCountMin ?? ""}
        onChange={handleMinChange}
        className="w-24 p-2 border border-gw-border bg-gw-chrome2 px-3 py-1.5 text-sm text-gw-primary outline-none transition-colors duration-150 focus:border-gw-border-md"
      />

      <label
        htmlFor="organizer-word-count-max-filter"
        className="text-xs text-gw-secondary"
      >
        Maximum words
      </label>
      <input
        id="organizer-word-count-max-filter"
        aria-label="Maximum words"
        type="number"
        min={0}
        value={filterState.wordCountMax ?? ""}
        onChange={handleMaxChange}
        className="w-24 p-2 border border-gw-border bg-gw-chrome2 px-3 py-1.5 text-sm text-gw-primary outline-none transition-colors duration-150 focus:border-gw-border-md"
      />
      {isWordCountActive && (
        <button
          type="button"
          aria-label="Clear word count filter"
          onClick={handleClearWordCount}
          className="text-gw-secondary hover:text-gw-primary"
        >
          <X size={14} />
        </button>
      )}

      {refFields.map((field) => {
        const controlId = `organizer-ref-filter-${field.key}`;
        const selectedRefValue =
          filterState.refFilters[field.key] ?? ALL_REF_VALUES_VALUE;
        const isRefFieldActive =
          filterState.refFilters[field.key] !== undefined;
        return (
          <React.Fragment key={field.key}>
            <label htmlFor={controlId} className="text-xs text-gw-secondary">
              {field.label}
            </label>
            <select
              id={controlId}
              aria-label={`Filter by ${field.label}`}
              value={selectedRefValue}
              onChange={(e) => handleRefFilterChange(field.key, e)}
              className="p-2 border border-gw-border bg-gw-chrome2 px-3 py-1.5 text-sm text-gw-primary outline-none transition-colors duration-150 focus:border-gw-border-md"
            >
              <option value={ALL_REF_VALUES_VALUE}>All {field.label}</option>
              {(refFieldValues[field.key] ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            {isRefFieldActive && (
              <button
                type="button"
                aria-label={`Clear ${field.label} filter`}
                onClick={() => handleClearRefFilter(field.key)}
                className="text-gw-secondary hover:text-gw-primary"
              >
                <X size={14} />
              </button>
            )}
          </React.Fragment>
        );
      })}

      {isAnyFilterActive && (
        <Button
          variant="secondary"
          size="xs"
          aria-label="Clear all filters"
          onClick={handleClearAll}
        >
          Clear all filters
        </Button>
      )}
    </div>
  );
}
