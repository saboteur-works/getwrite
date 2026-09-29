import type {
  AnyResource,
  MetadataField,
  ResourceRef,
  TextResource,
} from "../../../../src/lib/models/types";

/**
 * @module organizerFilters
 * Pure, view-local filter-state model for the Organizer view's card grid
 * (see `specs/features/organizer-card-filtering.md`). Holds the filter-state
 * shape, a reducer for the writer-facing filter actions, and the filter
 * predicates (status equality, word-count range, resource-ref field
 * membership) plus their AND-combination. Deliberately has no React or
 * Redux dependency — `OrganizerView.tsx` owns the `useReducer` call and
 * passes the resulting state/dispatch through.
 */

/** Sentinel filter value representing "no status set" (FR-1). */
export const NO_STATUS_FILTER_VALUE = "__no_status__";

/**
 * Current Organizer filter selections. All fields are optional/absent when
 * that filter is inactive.
 */
export interface OrganizerFilterState {
  /** Selected status value, or `NO_STATUS_FILTER_VALUE` for "no status". Absent = inactive. */
  status?: string;
  /** Minimum word count (inclusive). Absent = no lower bound. */
  wordCountMin?: number;
  /** Maximum word count (inclusive). Absent = no upper bound. */
  wordCountMax?: number;
  /** Selected resource-ref filter value per metadata field key. */
  refFilters: Record<string, string>;
}

/** The empty, all-filters-inactive state. */
export const initialOrganizerFilterState: OrganizerFilterState = {
  refFilters: {},
};

/** Discriminated filter keys addressable by the clear-one action. */
export type OrganizerFilterKey =
  | "status"
  | "wordCount"
  | { refFieldKey: string };

/** Actions the Organizer filter reducer accepts. */
export type OrganizerFilterAction =
  | { type: "set-status"; value: string | undefined }
  | {
      type: "set-word-count-range";
      min: number | undefined;
      max: number | undefined;
    }
  | { type: "set-ref-filter"; fieldKey: string; value: string | undefined }
  | { type: "clear-one"; key: OrganizerFilterKey }
  | { type: "clear-all" }
  | { type: "reset" };

/**
 * Reducer for `OrganizerFilterState`. Covers set-status, set-word-count-range,
 * set-ref-filter, clear-one (by filter key), clear-all, and reset-to-empty.
 */
export function organizerFilterReducer(
  state: OrganizerFilterState,
  action: OrganizerFilterAction,
): OrganizerFilterState {
  switch (action.type) {
    case "set-status":
      return { ...state, status: action.value };
    case "set-word-count-range":
      return { ...state, wordCountMin: action.min, wordCountMax: action.max };
    case "set-ref-filter": {
      const nextRefFilters = { ...state.refFilters };
      if (action.value === undefined) {
        delete nextRefFilters[action.fieldKey];
      } else {
        nextRefFilters[action.fieldKey] = action.value;
      }
      return { ...state, refFilters: nextRefFilters };
    }
    case "clear-one": {
      if (action.key === "status") {
        return { ...state, status: undefined };
      }
      if (action.key === "wordCount") {
        return { ...state, wordCountMin: undefined, wordCountMax: undefined };
      }
      const nextRefFilters = { ...state.refFilters };
      delete nextRefFilters[action.key.refFieldKey];
      return { ...state, refFilters: nextRefFilters };
    }
    case "clear-all":
    case "reset":
      return initialOrganizerFilterState;
    default:
      return state;
  }
}

/** Resolves a card's displayed status the same way `OrganizerCard` does. */
function resolveStatus(resource: AnyResource, defaultStatus: string): string {
  return (resource.userMetadata?.status as string | undefined) || defaultStatus;
}

/**
 * FR-2: status predicate. Matches "no status" (`NO_STATUS_FILTER_VALUE`)
 * against a resource whose resolved status is empty.
 */
function matchesStatus(
  resource: AnyResource,
  statusFilter: string,
  defaultStatus: string,
): boolean {
  const resolved = resolveStatus(resource, defaultStatus);
  if (statusFilter === NO_STATUS_FILTER_VALUE) {
    return resolved === "";
  }
  return resolved === statusFilter;
}

/**
 * FR-3/FR-4: word-count range predicate. Non-text resources never have a
 * word count and are excluded whenever the word-count filter is active.
 */
function matchesWordCountRange(
  resource: AnyResource,
  min: number | undefined,
  max: number | undefined,
): boolean {
  if (resource.type !== "text") {
    return false;
  }
  const wordCount = (resource as TextResource).wordCount ?? 0;
  if (min !== undefined && wordCount < min) {
    return false;
  }
  if (max !== undefined && wordCount > max) {
    return false;
  }
  return true;
}

/** Narrows a `MetadataValue` to a single `ResourceRef`-shaped value, if it is one. */
function asResourceRef(value: unknown): ResourceRef | undefined {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "name" in (value as Record<string, unknown>)
  ) {
    return value as ResourceRef;
  }
  return undefined;
}

/**
 * FR-6: resource-ref field membership predicate. A `multi-resource-ref`
 * field (array of refs) matches if the selected value is any one entry's
 * name; a single `resource-ref` field matches if its own name equals it.
 */
function matchesRefFilter(
  resource: AnyResource,
  field: MetadataField,
  selectedValue: string,
): boolean {
  const rawValue = resource.userMetadata?.[field.key];
  if (Array.isArray(rawValue)) {
    return rawValue.some(
      (entry) => asResourceRef(entry)?.name === selectedValue,
    );
  }
  const single = asResourceRef(rawValue);
  return single?.name === selectedValue;
}

/**
 * FR-2, FR-4, FR-6, FR-7: filters `children` down to the cards matching every
 * currently active filter (logical AND). `refFields` is the list of
 * `resource-ref`/`multi-resource-ref` metadata fields the active project
 * defines, used to resolve each active `refFilters` entry to its field.
 */
export function filterChildren(
  children: AnyResource[],
  state: OrganizerFilterState,
  refFields: MetadataField[],
  defaultStatus = "",
): AnyResource[] {
  const activeRefFilterEntries = Object.entries(state.refFilters).filter(
    ([, value]) => value !== undefined && value !== "",
  );
  const isWordCountFilterActive =
    state.wordCountMin !== undefined || state.wordCountMax !== undefined;

  return children.filter((child) => {
    if (state.status !== undefined) {
      if (!matchesStatus(child, state.status, defaultStatus)) {
        return false;
      }
    }

    if (isWordCountFilterActive) {
      if (
        !matchesWordCountRange(child, state.wordCountMin, state.wordCountMax)
      ) {
        return false;
      }
    }

    for (const [fieldKey, selectedValue] of activeRefFilterEntries) {
      const field = refFields.find((f) => f.key === fieldKey);
      if (!field) {
        continue;
      }
      if (!matchesRefFilter(child, field, selectedValue)) {
        return false;
      }
    }

    return true;
  });
}
