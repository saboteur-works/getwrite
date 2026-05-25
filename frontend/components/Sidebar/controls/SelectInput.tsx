"use client";

import React from "react";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";
import Select from "../../common/UI/Select/Select";

const EMPTY_MULTI_VALUE: string[] = [];

export interface SelectInputProps {
  /**
   * The field label displayed above the select.
   */
  label: string;
  /**
   * The available options to render in the select.
   */
  options: string[];
  /**
   * The current value(s): string for single select, string[] for multiselect.
   */
  value?: string | string[];
  /**
   * Callback fired when the selection changes.
   * For single select, passes a string.
   * For multiselect, passes a string[].
   */
  onChange?: (value: string | string[]) => void;
  /**
   * When true, allow multiple selections. Defaults to false.
   */
  multiple?: boolean;
  /**
   * Optional CSS class for the wrapper.
   */
  className?: string;
  /**
   * Optional aria-label for accessibility.
   */
  ariaLabel?: string;
}

export default function SelectInput({
  label,
  options,
  value,
  onChange,
  multiple = false,
  className = "",
  ariaLabel = "select-input",
}: SelectInputProps): JSX.Element {
  const defaultValue = multiple ? EMPTY_MULTI_VALUE : (options[0] ?? "");
  const [selected, setSelected] = useSyncedControlledValue(
    value ?? defaultValue,
    onChange,
  );

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (multiple) {
      const selectedOptions = Array.from(
        e.target.selectedOptions,
        (o) => o.value,
      );
      setSelected(selectedOptions);
    } else {
      setSelected(e.target.value);
    }
  };

  const displayValue = multiple
    ? Array.isArray(selected)
      ? selected
      : EMPTY_MULTI_VALUE
    : selected;

  return (
    <LabeledField label={label} className={className}>
      <Select
        aria-label={ariaLabel}
        className="w-full mt-2"
        value={displayValue}
        onChange={handleChange}
        multiple={multiple}
      >
        {!multiple && <option value="">(select)</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
    </LabeledField>
  );
}
