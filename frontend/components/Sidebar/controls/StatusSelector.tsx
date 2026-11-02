import React, { useId } from "react";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";
import { unknownStatusLabel } from "../../../src/lib/status-rollup";

/** Stable empty list so the default `options` keeps one reference. */
const NO_OPTIONS: string[] = [];

const NO_STATUS_LABEL = "No status";
const EMPTY_LIST_HINT =
  "No statuses yet. Add them in Project Settings, Metadata tab.";

export interface StatusSelectorProps {
  /** The stored status. Empty or undefined means the document has none. */
  value?: string;
  /** Called with the chosen status, or `""` when "No status" is chosen. */
  onChange?: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  /** Ordered list of status strings to render as options. Defaults to an empty list. */
  options?: string[];
}

/**
 * Status control (Feature 99). A document has a status only when one is
 * chosen: the first option is "No status" (value `""`), shown whenever nothing
 * is stored. A stored value absent from `options` is kept as a marked option
 * so it is shown, not hidden. An empty list shows a hint tied by
 * `aria-describedby`.
 */
export default function StatusSelector({
  value,
  onChange,
  className = "",
  ariaLabel = "status-select",
  options = NO_OPTIONS,
}: StatusSelectorProps) {
  const hintId = useId();
  const [status, setStatus] = useSyncedControlledValue(value ?? "", onChange);
  const isOffList = status !== "" && !options.includes(status);
  const shouldShowHint = options.length === 0;

  return (
    <LabeledField label="Status" className={className}>
      <select
        aria-label={ariaLabel}
        aria-describedby={shouldShowHint ? hintId : undefined}
        className="w-full mt-2 p-2 border border-gw-border bg-gw-chrome2 px-3 py-2 text-gw-label text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md disabled:cursor-not-allowed disabled:opacity-50"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="">{NO_STATUS_LABEL}</option>
        {isOffList && (
          <option value={status}>{unknownStatusLabel(status)}</option>
        )}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {shouldShowHint && (
        <p id={hintId} className="text-gw-label text-gw-secondary mt-1">
          {EMPTY_LIST_HINT}
        </p>
      )}
    </LabeledField>
  );
}
