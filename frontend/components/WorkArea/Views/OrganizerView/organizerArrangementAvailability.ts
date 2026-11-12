/**
 * @module organizerArrangementAvailability
 * Pure availability model for saved Organizer arrangements (Feature 109, FR-15).
 *
 * Decides whether a saved arrangement can be applied and, if not, why. A
 * missing referent is reported with a reason in text, never as an empty grid.
 * While any of folders, saved queries or the metadata schema is still loading
 * the result is `pending`: "not yet loaded" is a different fact from "gone"
 * (docs/standards/failure-visibility.md).
 *
 * The caller reports `loaded` only when the list truly loaded for the open
 * project (for queries: `queryState.projectId` equals the project and
 * `isLoadingQueries` is false; see experiments/task-3.md). A failed load must
 * not be passed as `loaded`. The function never changes its inputs and
 * returns no arrangement.
 */
import type {
  OrganizerArrangement,
  OrganizerArrangementAvailability,
  OrganizerAxis,
  OrganizerUnavailableReason,
} from "../../../../src/lib/models/organizer-grid-types";

/** One list that is either still loading or loaded with the ids it holds. */
export type LoadableIds =
  | { state: "loading" }
  | { state: "loaded"; ids: ReadonlyArray<string> };

/** The part of a metadata field the model reads. */
export interface AvailabilityField {
  key: string;
  type: string;
  deprecated?: boolean;
}

export type LoadableFields =
  | { state: "loading" }
  | { state: "loaded"; fields: ReadonlyArray<AvailabilityField> };

export interface ArrangementAvailabilityInputs {
  folders: LoadableIds;
  queries: LoadableIds;
  schema: LoadableFields;
}

/** Field types an axis may use (FR-4). */
const AXIS_FIELD_TYPES: ReadonlySet<string> = new Set([
  "select",
  "multiselect",
  "resource-ref",
  "multi-resource-ref",
]);

/** Texts name the problem and echo no stored id, key or name. */
const MESSAGES: Record<OrganizerUnavailableReason, string> = {
  "folder-missing": "The folder this arrangement shows no longer exists.",
  "query-missing": "The smart folder this arrangement shows no longer exists.",
  "field-missing": "A field this arrangement groups by no longer exists.",
  "field-not-axis-type":
    "A field this arrangement groups by can no longer be used to group cards.",
};

const unavailable = (
  reason: OrganizerUnavailableReason,
): OrganizerArrangementAvailability => ({
  status: "unavailable",
  reason,
  message: MESSAGES[reason],
});

function axisProblem(
  axis: OrganizerAxis,
  fields: ReadonlyArray<AvailabilityField>,
): OrganizerUnavailableReason | null {
  if (typeof axis === "string" || axis.kind !== "field") return null;
  const field = fields.find((f) => f.key === axis.key);
  if (!field) return "field-missing";
  if (field.deprecated === true || !AXIS_FIELD_TYPES.has(field.type)) {
    return "field-not-axis-type";
  }
  return null;
}

/**
 * Availability of one saved arrangement. Checks source first, then rows, then
 * columns, and reports the first problem found.
 */
export function getArrangementAvailability(
  arrangement: OrganizerArrangement,
  inputs: ArrangementAvailabilityInputs,
): OrganizerArrangementAvailability {
  const { folders, queries, schema } = inputs;
  if (
    folders.state === "loading" ||
    queries.state === "loading" ||
    schema.state === "loading"
  ) {
    return { status: "pending" };
  }

  const { source } = arrangement;
  if (source.kind === "folder" && !folders.ids.includes(source.folderId)) {
    return unavailable("folder-missing");
  }
  if (source.kind === "smart-folder" && !queries.ids.includes(source.queryId)) {
    return unavailable("query-missing");
  }

  const problem =
    axisProblem(arrangement.rows, schema.fields) ??
    axisProblem(arrangement.columns, schema.fields);
  return problem ? unavailable(problem) : { status: "available" };
}
