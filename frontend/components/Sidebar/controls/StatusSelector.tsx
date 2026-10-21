import React from "react";
import { BUILT_IN_STATUSES } from "../../../src/lib/models/default-statuses";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";

export interface StatusSelectorProps {
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  /** Ordered list of status strings to render as options. Defaults to the built-in statuses. */
  options?: string[];
}

export default function StatusSelector({
  value,
  onChange,
  className = "",
  ariaLabel = "status-select",
  options = BUILT_IN_STATUSES,
}: StatusSelectorProps) {
  const defaultValue = options[0] ?? "";
  const [status, setStatus] = useSyncedControlledValue(
    value ?? defaultValue,
    onChange,
  );

  return (
    <LabeledField label="Status" className={className}>
      <select
        aria-label={ariaLabel}
        className="w-full mt-2 p-2 border border-gw-border bg-gw-chrome2 px-3 py-2 text-gw-label text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md disabled:cursor-not-allowed disabled:opacity-50"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </LabeledField>
  );
}
