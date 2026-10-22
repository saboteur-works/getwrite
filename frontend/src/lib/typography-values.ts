// Last Updated: 2026-10-22

/**
 * Feature 91, Task 8 (FR-11, FR-12): pure codecs between the stored typography
 * forms and the shared component's numeric/choice values. A value that cannot
 * be parsed is reported and returned as stored; nothing here rewrites a stored
 * value, the caller writes only when the writer edits.
 */
import { FONT_FAMILY_LIST } from "./fonts/fonts";

export type ParsedNumber =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly stored: string };

const parseWithUnit = (stored: string, unit: "px" | "em"): ParsedNumber => {
  const match = new RegExp(`^(\\d+(?:\\.\\d+)?)${unit}$`).exec(stored.trim());
  return match ? { ok: true, value: Number(match[1]) } : { ok: false, stored };
};

export const parsePxSize = (stored: string): ParsedNumber =>
  parseWithUnit(stored, "px");
export const formatPxSize = (value: number): string => `${value}px`;

export const parseEmSpacing = (stored: string): ParsedNumber =>
  parseWithUnit(stored, "em");
export const formatEmSpacing = (value: number): string => `${value}em`;

/**
 * Normalises a colour the writer has just edited to lowercase `#rrggbb`.
 * Applied on edit only; a stored `#FFF` or `red` is displayed as stored. An
 * edit that is not a hex colour is returned unchanged.
 */
export const normalizeEditedColour = (edited: string): string => {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(edited.trim());
  if (!hex) return edited;
  const digits = hex[1].toLowerCase();
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((c) => c + c)
          .join("")
      : digits;
  return `#${full}`;
};

export interface WeightChoice {
  /** Numeric string, as stored. */
  readonly value: string;
  /** Plain label and number, for example "Regular 400". */
  readonly label: string;
}

const DEFAULT_WEIGHTS: readonly WeightChoice[] = [
  { value: "400", label: "Regular 400" },
  { value: "700", label: "Bold 700" },
];

/** The weights offered for a family (FR-11); "Use default" is separate. */
export const weightsForFamily = (family: string): readonly WeightChoice[] => {
  const key = family.trim().toLowerCase();
  const entry = FONT_FAMILY_LIST.find((f) => f.label.toLowerCase() === key);
  if (!entry || entry.weights.length === 0) return DEFAULT_WEIGHTS;
  return entry.weights.map((w) => ({
    value: String(w.weight),
    label: `${w.label} ${w.weight}`,
  }));
};

export interface WeightSelectState {
  /** The select's value: an offered numeric string, the stored string for an extra, or "" for Use default. */
  readonly selected: string;
  /** Present when the stored weight is not offered; value is the stored string. */
  readonly extra: WeightChoice | null;
}

const KEYWORD_DISPLAY: Readonly<Record<string, string>> = {
  normal: "400",
  bold: "700",
};

/** Resolves a stored weight against the family's offering, display only. */
export const weightSelectState = (
  family: string,
  stored: string | undefined,
): WeightSelectState => {
  const value = (stored ?? "").trim();
  if (value === "") return { selected: "", extra: null };
  const display = KEYWORD_DISPLAY[value.toLowerCase()] ?? value;
  if (weightsForFamily(family).some((o) => o.value === display)) {
    return { selected: display, extra: null };
  }
  return {
    selected: stored as string,
    extra: { value: stored as string, label: `${display} (current value)` },
  };
};
