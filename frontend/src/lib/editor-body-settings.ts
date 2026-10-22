import { buildFontFamilyValue } from "./fonts/font-family-stack";
import type { EditorBodyConfig } from "./models/types";

export type { EditorBodyConfig };

export interface EditorBodyFieldDefinition {
  key: keyof EditorBodyConfig;
  label: string;
  placeholder: string;
}

export const DEFAULT_BODY_CONFIG: EditorBodyConfig = {
  fontFamily: "IBM Plex Serif",
  fontSize: "15px",
  lineHeight: "1.8",
  paragraphSpacing: "16px",
};

export const BODY_FIELD_DEFINITIONS: EditorBodyFieldDefinition[] = [
  {
    key: "fontFamily",
    label: "Font Family",
    placeholder: "e.g. IBM Plex Serif",
  },
  { key: "fontSize", label: "Font Size", placeholder: "e.g. 18px" },
  { key: "lineHeight", label: "Line Height", placeholder: "e.g. 1.8" },
  {
    key: "paragraphSpacing",
    label: "Paragraph Spacing",
    placeholder: "e.g. 1em",
  },
];

/**
 * CSS custom properties for the editor body. The family goes through
 * `buildFontFamilyValue` (Feature 91, FR-9); an empty family sets nothing.
 */
export function buildEditorBodyStyleVariables(
  body: EditorBodyConfig | undefined,
): Record<string, string | undefined> {
  return {
    "--gw-body-font-family": buildFontFamilyValue(body?.fontFamily),
    "--gw-body-font-size": body?.fontSize,
    "--gw-body-line-height": body?.lineHeight,
    "--gw-paragraph-spacing": body?.paragraphSpacing,
  };
}

/** The one message shown and returned for every refused project line height. */
export const LINE_HEIGHT_FLOOR_MESSAGE =
  "Line height must be a number of at least 1.8.";

const MIN_PROJECT_LINE_HEIGHT = 1.8;
const UNITLESS_NUMBER = /^\d+(\.\d+)?$/;

/**
 * Validates a project body line height. Empty (after trimming) means "use
 * 1.8" and is valid. Otherwise the value must be a unitless number of at
 * least 1.8, with no upper bound; `normal`, `%`, `em` and `px` are refused.
 * Refuses, never clamps.
 *
 * @returns {@link LINE_HEIGHT_FLOOR_MESSAGE} when refused, otherwise `undefined`.
 */
export function getLineHeightError(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return undefined;
  if (!UNITLESS_NUMBER.test(trimmed)) return LINE_HEIGHT_FLOOR_MESSAGE;
  return Number(trimmed) >= MIN_PROJECT_LINE_HEIGHT
    ? undefined
    : LINE_HEIGHT_FLOOR_MESSAGE;
}

/** Thrown by write paths when a project line height is refused. */
export class InvalidLineHeightError extends Error {
  constructor() {
    super(LINE_HEIGHT_FLOOR_MESSAGE);
    this.name = "InvalidLineHeightError";
  }
}

function normalizeBodyValue(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function sanitizeEditorBody(
  body: EditorBodyConfig | undefined,
): EditorBodyConfig | undefined {
  if (!body) return undefined;

  const sanitized: EditorBodyConfig = {};

  for (const key of Object.keys(body) as (keyof EditorBodyConfig)[]) {
    const value = normalizeBodyValue(body[key]);
    if (value) sanitized[key] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
