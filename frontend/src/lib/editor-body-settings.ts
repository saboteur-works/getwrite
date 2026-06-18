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
