import React from "react";
import Select from "../../../common/UI/Select";
import type {
  OrganizerAxis,
  OrganizerSource,
} from "../../../../src/lib/models/organizer-grid-types";

/**
 * @module OrganizerGridToolbar
 * First-wave toolbar of the Organizer grid (Feature 109, FR-2, FR-3, FR-19):
 * the Rows picker, the Columns picker and the source select. Props-driven and
 * presentational: the caller owns the arrangement state and passes the fields
 * its axis model offers. Native selects, each with a visible text label, so
 * every control is keyboard operable and carries no colour-only state.
 */

/** A field offered to an axis picker: the stored axis and its heading text. */
export interface OrganizerAxisChoice {
  axis: OrganizerAxis;
  label: string;
}

/** A saved smart folder offered as a source. */
export interface OrganizerSmartFolderChoice {
  id: string;
  name: string;
}

/** Props accepted by {@link OrganizerGridToolbar}. */
export interface OrganizerGridToolbarProps {
  /** Fields offered to both pickers (never "none" or "order"). */
  fieldChoices: OrganizerAxisChoice[];
  rows: OrganizerAxis;
  columns: OrganizerAxis;
  onRowsChange: (axis: OrganizerAxis) => void;
  onColumnsChange: (axis: OrganizerAxis) => void;
  source: OrganizerSource;
  /** The folder the folder sources apply to (the browsing folder). */
  folderId: string;
  /** Saved smart folders offered as sources. */
  smartFolders: OrganizerSmartFolderChoice[];
  onSourceChange: (source: OrganizerSource) => void;
}

const SMART_PREFIX = "smart:";
const MISSING_SMART_FOLDER_LABEL = "Smart folder (not found)";

/** Select value for an axis. */
function axisValue(axis: OrganizerAxis): string {
  if (typeof axis === "string") return axis;
  return axis.kind === "field" ? `field:${axis.key}` : axis.kind;
}

/** Parses a select value back into an axis, or null when unknown. */
function parseAxis(
  value: string,
  choices: OrganizerAxisChoice[],
): OrganizerAxis | null {
  if (value === "none" || value === "order") return value;
  return choices.find((c) => axisValue(c.axis) === value)?.axis ?? null;
}

function sourceValue(source: OrganizerSource): string {
  return source.kind === "smart-folder"
    ? `${SMART_PREFIX}${source.queryId}`
    : source.scope;
}

const SELECT_CLASS = "min-w-0 max-w-full";
const LABEL_CLASS =
  "flex min-w-0 max-w-full items-center gap-2 text-xs text-gw-secondary";

interface AxisPickerProps {
  label: string;
  value: OrganizerAxis;
  leading: { value: string; label: string };
  choices: OrganizerAxisChoice[];
  onChange: (axis: OrganizerAxis) => void;
}

function AxisPicker({
  label,
  value,
  leading,
  choices,
  onChange,
}: AxisPickerProps): JSX.Element {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const axis = parseAxis(e.target.value, choices);
    if (axis !== null) onChange(axis);
  };
  return (
    <label className={LABEL_CLASS}>
      <span>{label}</span>
      <Select
        value={axisValue(value)}
        onChange={handleChange}
        className={SELECT_CLASS}
      >
        <option value={leading.value}>{leading.label}</option>
        {choices.map((c) => (
          <option key={axisValue(c.axis)} value={axisValue(c.axis)}>
            {c.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

/**
 * Rows picker (none or a field), Columns picker (order or a field) and the
 * source select. A field chosen for one axis is not offered for the other.
 */
export default function OrganizerGridToolbar({
  fieldChoices,
  rows,
  columns,
  onRowsChange,
  onColumnsChange,
  source,
  folderId,
  smartFolders,
  onSourceChange,
}: OrganizerGridToolbarProps): JSX.Element {
  const rowChoices = fieldChoices.filter(
    (c) => axisValue(c.axis) !== axisValue(columns),
  );
  const columnChoices = fieldChoices.filter(
    (c) => axisValue(c.axis) !== axisValue(rows),
  );

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "children" || value === "descendants") {
      onSourceChange({ kind: "folder", folderId, scope: value });
    } else if (value.startsWith(SMART_PREFIX)) {
      onSourceChange({
        kind: "smart-folder",
        queryId: value.slice(SMART_PREFIX.length),
      });
    }
  };

  const isSavedMissing =
    source.kind === "smart-folder" &&
    !smartFolders.some((q) => q.id === source.queryId);

  return (
    <div
      role="group"
      aria-label="Organizer arrangement"
      className="mb-4 flex flex-wrap items-center gap-3"
    >
      <label className={LABEL_CLASS}>
        <span>Source</span>
        <Select
          value={sourceValue(source)}
          onChange={handleSourceChange}
          className={SELECT_CLASS}
        >
          <option value="children">This folder</option>
          <option value="descendants">This folder and subfolders</option>
          {smartFolders.map((q) => (
            <option key={q.id} value={`${SMART_PREFIX}${q.id}`}>
              {q.name}
            </option>
          ))}
          {isSavedMissing && source.kind === "smart-folder" && (
            <option value={`${SMART_PREFIX}${source.queryId}`}>
              {MISSING_SMART_FOLDER_LABEL}
            </option>
          )}
        </Select>
      </label>
      <AxisPicker
        label="Rows"
        value={rows}
        leading={{ value: "none", label: "None" }}
        choices={rowChoices}
        onChange={onRowsChange}
      />
      <AxisPicker
        label="Columns"
        value={columns}
        leading={{ value: "order", label: "Order" }}
        choices={columnChoices}
        onChange={onColumnsChange}
      />
    </div>
  );
}
