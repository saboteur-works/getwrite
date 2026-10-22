// Last Updated: 2026-10-22
"use client";

/**
 * Feature 91, Task 15 (FR-12, FR-13): the shared typography component.
 *
 * Controlled and stateless apart from what its children hold (the "Other..."
 * field's open/draft state lives in `FontFamilySelect`). A `fields` prop
 * chooses which inputs show; each form passes only the inputs its stored shape
 * has. Stored forms: size `"<n>px"`, letter spacing `"<n>em"`, colour as typed
 * by the picker (`#rrggbb`), weight a numeric string, family a label or typed
 * name. A stored value the codecs cannot parse (for example `"1.5rem"`, `red`)
 * is shown as text and is never rewritten: change callbacks fire only from a
 * writer edit, never on mount. Task 16 adds the body-only free-text
 * line height (refused below 1.8 via `getLineHeightError`; a refused value
 * stays typed and is never passed to `onChange`) and paragraph spacing.
 *
 * Every input has a visible label and an accessible name that includes the
 * level (`aria-label` "H2 Font Size"). The colour input is a native
 * `<input type="color">` with its value shown as text.
 */
import React from "react";
import Input from "../common/UI/Input/Input";
import FontFamilySelect from "../preferences/FontFamilySelect";
import FontWeightSelect from "../preferences/FontWeightSelect";
import { getLineHeightError } from "../../src/lib/editor-body-settings";
import {
  formatEmSpacing,
  formatPxSize,
  normalizeEditedColour,
  parseEmSpacing,
  parsePxSize,
  type ParsedNumber,
} from "../../src/lib/typography-values";

export type TypographyFieldKey =
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "color"
  | "letterSpacing"
  | "lineHeight"
  | "paragraphSpacing";

export interface TypographyValues {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  color?: string;
  letterSpacing?: string;
  lineHeight?: string;
  paragraphSpacing?: string;
}

export interface TypographyFieldsProps {
  /** Level or area name that is part of every accessible name, for example "H2" or "Body". */
  label: string;
  /** Prefix that makes the input ids unique within the page. */
  idPrefix: string;
  /** Which inputs to show. */
  fields: readonly TypographyFieldKey[];
  /** The stored (draft) values. */
  values: TypographyValues;
  /** Called with the field and its new stored-form value; "" clears the field. */
  onChange: (key: TypographyFieldKey, value: string) => void;
  /**
   * Optional. Reports a field's refused/valid state to the parent whenever it
   * changes (and once on mount for the line height field). A parent uses it to
   * block Save while any field is refused; a refused value is still never
   * passed to `onChange`.
   */
  onRefusalChange?: (key: TypographyFieldKey, refused: boolean) => void;
  /** Show "Other..." in the family dropdown (settings forms). */
  allowOther?: boolean;
  disabled?: boolean;
  className?: string;
}

const COLOUR_PLACEHOLDER = "#000000"; // GW-HEX-EXEMPT: color picker placeholder, user-selected arbitrary colors
const HEX6 = /^#[0-9a-f]{6}$/i;

const FIELD_LABELS: Readonly<Record<TypographyFieldKey, string>> = {
  fontFamily: "Font Family",
  fontSize: "Font Size",
  fontWeight: "Font Weight",
  color: "Color",
  letterSpacing: "Letter Spacing",
  lineHeight: "Line Height",
  paragraphSpacing: "Paragraph Spacing",
};

interface FieldShellProps {
  id: string;
  label: string;
  children: React.ReactNode;
}

function FieldShell({ id, label, children }: FieldShellProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

interface LineHeightFieldProps {
  id: string;
  name: string;
  stored: string;
  disabled: boolean;
  onAccept: (value: string) => void;
  onRefusalChange?: (refused: boolean) => void;
}

/**
 * Free-text line height. A refused value stays in the box (local draft) with
 * an alert and is not reported to the parent; an accepted or empty value is.
 */
function LineHeightField({
  id,
  name,
  stored,
  disabled,
  onAccept,
  onRefusalChange,
}: LineHeightFieldProps): JSX.Element {
  const [typed, setTyped] = React.useState<string | null>(null);
  const shown = typed ?? stored;
  const error = getLineHeightError(shown);
  const isRefused = Boolean(error);
  const reportRef = React.useRef(onRefusalChange);
  reportRef.current = onRefusalChange;
  React.useEffect(() => {
    reportRef.current?.(isRefused);
  }, [isRefused]);
  React.useEffect(
    () => () => {
      reportRef.current?.(false);
    },
    [],
  );
  const errorId = `${id}-error`;
  return (
    <FieldShell id={id} label={FIELD_LABELS.lineHeight}>
      <Input
        id={id}
        aria-label={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        type="text"
        placeholder="e.g. 1.8"
        disabled={disabled}
        value={shown}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
          const raw = event.target.value;
          if (getLineHeightError(raw)) {
            setTyped(raw);
            return;
          }
          setTyped(null);
          onAccept(raw);
        }}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-gw-secondary">
          {error}
        </p>
      ) : null}
    </FieldShell>
  );
}

function numberInputValue(parsed: ParsedNumber): string {
  return parsed.ok ? String(parsed.value) : "";
}

function colourInputValue(stored: string): string {
  const expanded = normalizeEditedColour(stored);
  return HEX6.test(expanded) ? expanded.toLowerCase() : COLOUR_PLACEHOLDER;
}

/**
 * Parent-side bookkeeping for `onRefusalChange`: which fields are refused now.
 * `isBlocked` is true while any field is refused.
 */
export function useRefusedFields(): {
  isBlocked: boolean;
  report: (key: TypographyFieldKey, refused: boolean) => void;
} {
  const [refused, setRefused] = React.useState<readonly TypographyFieldKey[]>(
    [],
  );
  const report = React.useCallback(
    (key: TypographyFieldKey, isRefused: boolean): void => {
      setRefused((prev) => {
        const has = prev.includes(key);
        if (has === isRefused) return prev;
        return isRefused ? [...prev, key] : prev.filter((k) => k !== key);
      });
    },
    [],
  );
  return { isBlocked: refused.length > 0, report };
}

export default function TypographyFields({
  label,
  idPrefix,
  fields,
  values,
  onChange,
  onRefusalChange,
  allowOther = false,
  disabled = false,
  className,
}: TypographyFieldsProps): JSX.Element {
  const shows = (key: TypographyFieldKey): boolean => fields.includes(key);
  const nameOf = (key: TypographyFieldKey): string =>
    `${label} ${FIELD_LABELS[key]}`;
  const idOf = (key: TypographyFieldKey): string => `${idPrefix}-${key}`;
  const stored = (key: TypographyFieldKey): string => values[key] ?? "";

  const renderNumber = (
    key: "fontSize" | "letterSpacing",
    parse: (s: string) => ParsedNumber,
    format: (n: number) => string,
    attrs: { step: string; min: string; placeholder: string },
  ): JSX.Element => {
    const parsed = parse(stored(key));
    const noteId = `${idOf(key)}-stored`;
    const isUnparsed = !parsed.ok && stored(key).trim() !== "";
    return (
      <FieldShell id={idOf(key)} label={FIELD_LABELS[key]}>
        <Input
          id={idOf(key)}
          aria-label={nameOf(key)}
          aria-describedby={isUnparsed ? noteId : undefined}
          type="number"
          step={attrs.step}
          min={attrs.min}
          placeholder={attrs.placeholder}
          disabled={disabled}
          value={numberInputValue(parsed)}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
            const raw = event.target.value;
            const n = Number(raw);
            onChange(
              key,
              raw.trim() === "" || !Number.isFinite(n) ? "" : format(n),
            );
          }}
        />
        {isUnparsed ? (
          <p id={noteId} className="text-xs text-gw-secondary">
            Current value: {stored(key)}
          </p>
        ) : null}
      </FieldShell>
    );
  };

  return (
    <div className={className ?? "grid gap-3 md:grid-cols-2 xl:grid-cols-3"}>
      {shows("fontSize")
        ? renderNumber("fontSize", parsePxSize, formatPxSize, {
            step: "1",
            min: "1",
            placeholder: "e.g. 32",
          })
        : null}
      {shows("fontFamily") ? (
        <FieldShell id={idOf("fontFamily")} label={FIELD_LABELS.fontFamily}>
          <FontFamilySelect
            id={idOf("fontFamily")}
            aria-label={nameOf("fontFamily")}
            value={values.fontFamily}
            allowOther={allowOther}
            disabled={disabled}
            onChange={(next: string): void => onChange("fontFamily", next)}
          />
        </FieldShell>
      ) : null}
      {shows("fontWeight") ? (
        <FieldShell id={idOf("fontWeight")} label={FIELD_LABELS.fontWeight}>
          <FontWeightSelect
            id={idOf("fontWeight")}
            aria-label={nameOf("fontWeight")}
            family={values.fontFamily}
            value={values.fontWeight}
            disabled={disabled}
            onChange={(next: string): void => onChange("fontWeight", next)}
          />
        </FieldShell>
      ) : null}
      {shows("letterSpacing")
        ? renderNumber("letterSpacing", parseEmSpacing, formatEmSpacing, {
            step: "0.01",
            min: "0",
            placeholder: "e.g. 0.08",
          })
        : null}
      {shows("lineHeight") ? (
        <LineHeightField
          id={idOf("lineHeight")}
          name={nameOf("lineHeight")}
          stored={stored("lineHeight")}
          disabled={disabled}
          onAccept={(value: string): void => onChange("lineHeight", value)}
          onRefusalChange={
            onRefusalChange
              ? (refused: boolean): void =>
                  onRefusalChange("lineHeight", refused)
              : undefined
          }
        />
      ) : null}
      {shows("paragraphSpacing") ? (
        <FieldShell
          id={idOf("paragraphSpacing")}
          label={FIELD_LABELS.paragraphSpacing}
        >
          <Input
            id={idOf("paragraphSpacing")}
            aria-label={nameOf("paragraphSpacing")}
            type="text"
            placeholder="e.g. 1em"
            disabled={disabled}
            value={stored("paragraphSpacing")}
            onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
              onChange("paragraphSpacing", event.target.value)
            }
          />
        </FieldShell>
      ) : null}
      {shows("color") ? (
        <FieldShell id={idOf("color")} label={FIELD_LABELS.color}>
          <div className="flex items-center gap-2">
            <input
              id={idOf("color")}
              aria-label={nameOf("color")}
              type="color"
              disabled={disabled}
              value={colourInputValue(stored("color"))}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                onChange("color", normalizeEditedColour(event.target.value))
              }
              className="h-8 w-10 cursor-pointer border border-gw-border bg-gw-chrome2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gw-secondary disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="font-mono text-xs text-gw-secondary">
              {stored("color")}
            </span>
          </div>
        </FieldShell>
      ) : null}
    </div>
  );
}
