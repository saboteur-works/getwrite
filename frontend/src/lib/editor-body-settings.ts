import type { EditorBodyConfig } from "./models/types";

export type { EditorBodyConfig };

export interface EditorBodyFieldDefinition {
    key: keyof EditorBodyConfig;
    label: string;
    placeholder: string;
}

export const BODY_FIELD_DEFINITIONS: EditorBodyFieldDefinition[] = [
    {
        key: "fontFamily",
        label: "Font Family",
        placeholder: "e.g. IBM Plex Serif",
    },
    {
        key: "fontSize",
        label: "Font Size",
        placeholder: "e.g. 18px",
    },
    {
        key: "lineHeight",
        label: "Line Height",
        placeholder: "e.g. 1.8",
    },
    {
        key: "paragraphSpacing",
        label: "Paragraph Spacing",
        placeholder: "e.g. 1em",
    },
];

function normalizeBodyValue(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed || undefined;
}

export function sanitizeEditorBody(
    body: EditorBodyConfig | undefined,
): EditorBodyConfig | undefined {
    if (!body) return undefined;

    const sanitized: EditorBodyConfig = {};
    const fontFamily = normalizeBodyValue(body.fontFamily);
    const fontSize = normalizeBodyValue(body.fontSize);
    const lineHeight = normalizeBodyValue(body.lineHeight);
    const paragraphSpacing = normalizeBodyValue(body.paragraphSpacing);

    if (fontFamily) sanitized.fontFamily = fontFamily;
    if (fontSize) sanitized.fontSize = fontSize;
    if (lineHeight) sanitized.lineHeight = lineHeight;
    if (paragraphSpacing) sanitized.paragraphSpacing = paragraphSpacing;

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
