// Last Updated: 2026-10-22
"use client";

/**
 * Feature 91, Task 14 (FR-11): the weight select.
 *
 * Offers exactly the weights shipped for the chosen family plus "Use default".
 * A stored weight the family does not offer (including "lighter", "bolder" and
 * a 700 for Source Serif 4) is shown as a labelled extra entry. Keywords
 * "normal" and "bold" display as 400 and 700. Display only: nothing is
 * rewritten and no change callback fires on render. Weights are emitted as
 * numeric strings.
 */
import React from "react";
import Select from "../common/UI/Select/Select";
import { cn } from "../common/UI/utils";
import {
  weightSelectState,
  weightsForFamily,
} from "../../src/lib/typography-values";

export interface FontWeightSelectProps {
  /** The chosen font family (label or typed name); decides the offered weights. */
  family: string | undefined;
  /** The stored weight, as stored. */
  value: string | undefined;
  /** Called with a numeric string, or "" for "Use default". */
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export default function FontWeightSelect({
  family,
  value,
  onChange,
  className,
  ...rest
}: FontWeightSelectProps): JSX.Element {
  const familyName = family ?? "";
  const state = weightSelectState(familyName, value);
  return (
    <Select
      {...rest}
      className={cn(
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gw-secondary",
        className,
      )}
      value={state.selected}
      onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => {
        if (state.extra && event.target.value === state.extra.value) return;
        onChange(event.target.value);
      }}
    >
      <option value="">Use default</option>
      {weightsForFamily(familyName).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {state.extra ? (
        <option value={state.extra.value}>{state.extra.label}</option>
      ) : null}
    </Select>
  );
}
