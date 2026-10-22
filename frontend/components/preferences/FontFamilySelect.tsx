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
 * Task 13 (FR-9, FR-13): with `allowOther` (settings forms only) the list ends
 * with "Other...". Choosing it, or opening on an unlisted stored value, shows
 * a name field, the fixed hint (linked by `aria-describedby`) and, for a newly
 * typed name with a refused character, a `role="alert"` message (text and
 * role, no red). Typed names go through `validateTypedFontName`; a stored
 * value is never validated, so it shows unchanged and nothing is written on
 * open or close. A refused name writes nothing; an empty name clears. Without
 * `allowOther` (toolbar) there is no "Other..." and an unlisted stored value
 * stays a read-only extra entry. State held: whether the field is open and
 * the typed draft text.
 */
import React, { useEffect, useId, useRef, useState } from "react";
import Input from "../common/UI/Input/Input";
import Select from "../common/UI/Select/Select";
import { cn } from "../common/UI/utils";
import {
  FONT_FAMILY_LIST,
  OTHER_FONT_OPTION,
  type FontFamilyEntry,
} from "../../src/lib/fonts/fonts";
import {
  buildFontFamilyValue,
  validateTypedFontName,
} from "../../src/lib/fonts/font-family-stack";

const OTHER_HINT =
  "If this font isn't installed on this device, text shows in IBM Plex Serif.";

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
  /** Called when "Other..." is chosen (the name field opens regardless). */
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
  const isUnlisted = selectedKey(stored, entry) === EXTRA_VALUE;
  const [isOtherOpen, setIsOtherOpen] = useState<boolean>(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focusRequested = useRef<boolean>(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const errorId = useId();

  const shouldShowField = allowOther && (isOtherOpen || isUnlisted);
  const current = shouldShowField ? OTHER_VALUE : selectedKey(stored, entry);
  const shouldShowExtra = !allowOther && isUnlisted;
  const fieldText = draft ?? (isUnlisted ? stored : "");
  const baseLabel = rest["aria-label"] ?? "Font family";

  useEffect(() => {
    if (shouldShowField && focusRequested.current) {
      focusRequested.current = false;
      fieldRef.current?.focus();
    }
  }, [shouldShowField]);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const next = event.target.value;
    if (next === OTHER_VALUE) {
      focusRequested.current = true;
      setIsOtherOpen(true);
      onOther?.();
    } else if (next === EXTRA_VALUE) {
      return;
    } else {
      setIsOtherOpen(false);
      setDraft(null);
      setError(null);
      onChange(next);
    }
  };

  const handleNameChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const typed = event.target.value;
    setIsOtherOpen(true);
    setDraft(typed);
    const result = validateTypedFontName(typed);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onChange(result.value);
  };

  const describedBy = error ? `${hintId} ${errorId}` : hintId;

  return (
    <>
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
      {shouldShowField ? (
        <div className="mt-1 flex flex-col gap-1">
          <Input
            ref={fieldRef}
            type="text"
            aria-label={`${baseLabel} other name`}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            disabled={rest.disabled}
            value={fieldText}
            onChange={handleNameChange}
            className={cn(
              "text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gw-secondary",
              className,
            )}
          />
          <p id={hintId} className="text-xs text-gw-secondary">
            {OTHER_HINT}
          </p>
          {error ? (
            <p id={errorId} role="alert" className="text-xs text-gw-primary">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
