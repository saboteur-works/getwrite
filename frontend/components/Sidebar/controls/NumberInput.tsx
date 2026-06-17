"use client";

import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";
import Input from "../../common/UI/Input/Input";

export interface NumberInputProps {
  /**
   * The field label displayed above the input.
   */
  label: string;
  /**
   * The current numeric value, or undefined if not set.
   */
  value?: number;
  /**
   * Callback fired when the input value changes.
   */
  onChange?: (value: number) => void;
  /**
   * Optional CSS class for the wrapper.
   */
  className?: string;
  /**
   * Optional aria-label for accessibility.
   */
  ariaLabel?: string;
}

export default function NumberInput({
  label,
  value,
  onChange,
  className = "",
  ariaLabel = "number-input",
}: NumberInputProps): JSX.Element {
  const [number, setNumber] = useSyncedControlledValue(value ?? 0, onChange);

  return (
    <LabeledField label={label} className={className}>
      <Input
        type="number"
        aria-label={ariaLabel}
        className="w-full mt-2"
        value={number}
        onChange={(e) => {
          const v = e.target.value;
          const numValue = v === "" ? 0 : parseFloat(v);
          if (!isNaN(numValue)) {
            setNumber(numValue);
          }
        }}
      />
    </LabeledField>
  );
}
