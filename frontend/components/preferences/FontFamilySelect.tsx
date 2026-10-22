// Last Updated: 2026-10-22
"use client";

/**
 * Feature 91, Task 12 (FR-8, FR-9, FR-13, FR-18): the one font-family
 * dropdown.
 *
 * Accessibility pattern (docs/standards/accessibility.md section 2: prefer a
 * native element): a native `<select>`. The browser supplies the combobox
 * role, the open/move/choose/Esc keyboard model and focus handling; the
 * component adds a visible `focus-visible` ring and an accessible name from
 * the caller's `aria-label` or `id` + label.
 *
 * The list is always shown in full (`FONT_FAMILY_LIST`), never filtered by
 * the current value, and reads no installed-font data. A stored value that
 * matches an entry case-insensitively selects that entry and is not rewritten.
 * A stored value matching no entry is shown as a read-only extra entry with
 * the stored text unchanged, never folded to the empty selection. No change
 * callback fires on render, open or close.
 *
 * Choosing "Other..." (settings forms only, `allowOther`) calls `onOther`;
 * the name field itself is Task 13's.
 */
import React from "react";
import Select from "../common/UI/Select/Select";
import { cn } from "../common/UI/utils";
import {
  FONT_FAMILY_LIST,
  OTHER_FONT_OPTION,
  type FontFamilyEntry,
} from "../../src/lib/fonts/fonts";
import { buildFontFamilyValue } from "../../src/lib/fonts/font-family-stack";

// Internal option values: stored text never reaches an option value, so a
// stored string cannot collide with these.
const EMPTY_VALUE = "";
const EXTRA_VALUE = "__extra__";
const OTHER_VALUE = "__other__";

export interface FontFamilySelectProps {
  value: string | undefined;
  /** Called with the chosen list label, or "" for the default entry. */
  onChange: (value: string) => void;
  /** Show "Other..." (settings forms). Absent in the editor toolbar. */
  allowOther?: boolean;
  /** Called when "Other..." is chosen. */
  onOther?: () => void;
  /** Label of the empty entry; `null` omits it (toolbar shows an effective value). */
  emptyLabel?: string | null;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

function findEntry(value: string): FontFamilyEntry | undefined {
  const lower = value.toLowerCase();
  return FONT_FAMILY_LIST.find((entry) => entry.label.toLowerCase() === lower);
}

function selectedKey(
  value: string,
  entry: FontFamilyEntry | undefined,
): string {
  if (value.trim() === "") return EMPTY_VALUE;
  return entry ? entry.label : EXTRA_VALUE;
}

export default function FontFamilySelect({
  value,
  onChange,
  allowOther = false,
  onOther,
  emptyLabel = "Use default",
  className,
  ...rest
}: FontFamilySelectProps): JSX.Element {
  const stored = value ?? "";
  const entry = findEntry(stored);
  const current = selectedKey(stored, entry);
  const shouldShowExtra = current === EXTRA_VALUE;

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const next = event.target.value;
    if (next === OTHER_VALUE) {
      onOther?.();
    } else if (next === EXTRA_VALUE) {
      return;
    } else {
      onChange(next);
    }
  };

  return (
    <Select
      {...rest}
      className={cn(
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gw-secondary",
        className,
      )}
      value={current}
      onChange={handleChange}
    >
      {emptyLabel !== null || current === EMPTY_VALUE ? (
        <option value={EMPTY_VALUE}>{emptyLabel ?? ""}</option>
      ) : null}
      {FONT_FAMILY_LIST.map((font) => (
        <option
          key={font.label}
          value={font.label}
          style={
            font.kind === "system"
              ? undefined
              : { fontFamily: buildFontFamilyValue(font.label) }
          }
        >
          {font.label}
        </option>
      ))}
      {shouldShowExtra ? <option value={EXTRA_VALUE}>{stored}</option> : null}
      {allowOther ? (
        <option value={OTHER_VALUE}>{OTHER_FONT_OPTION}</option>
      ) : null}
    </Select>
  );
}
