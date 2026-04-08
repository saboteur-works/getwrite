import type { EditorHeading, EditorHeadings } from "./models/types";

export type EditorHeadingMap = Partial<Record<EditorHeadings, EditorHeading>>;
export type EditorHeadingFieldKey = keyof EditorHeading;

export interface EditorHeadingFieldDefinition {
    key: EditorHeadingFieldKey;
    label: string;
    placeholder: string;
}

export const ORDERED_HEADING_LEVELS: EditorHeadings[] = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
];

export const DEFAULT_VISIBLE_HEADING_LEVELS: EditorHeadings[] = [
    "h1",
    "h2",
    "h3",
];

export const HEADING_FIELD_DEFINITIONS: EditorHeadingFieldDefinition[] = [
    {
        key: "fontSize",
        label: "Font Size",
        placeholder: "e.g. 32px",
    },
    {
        key: "fontFamily",
        label: "Font Family",
        placeholder: "e.g. IBM Plex Sans",
    },
    {
        key: "fontWeight",
        label: "Font Weight",
        placeholder: "e.g. 700",
    },
    {
        key: "letterSpacing",
        label: "Letter Spacing",
        placeholder: "e.g. 0.08em",
    },
    {
        key: "color",
        label: "Color",
        placeholder: "e.g. #D44040",
    },
];

function normalizeHeadingValue(value: string | undefined): string | undefined {
    const trimmedValue = value?.trim();

    if (!trimmedValue) {
        return undefined;
    }

    return trimmedValue;
}

export function sanitizeEditorHeading(
    heading: EditorHeading | undefined,
): EditorHeading | undefined {
    if (!heading) {
        return undefined;
    }

    const sanitizedHeading: EditorHeading = {};
    const fontSize = normalizeHeadingValue(heading.fontSize);
    const fontFamily = normalizeHeadingValue(heading.fontFamily);
    const fontWeight = normalizeHeadingValue(heading.fontWeight);
    const letterSpacing = normalizeHeadingValue(heading.letterSpacing);
    const color = normalizeHeadingValue(heading.color);

    if (fontSize) {
        sanitizedHeading.fontSize = fontSize;
    }

    if (fontFamily) {
        sanitizedHeading.fontFamily = fontFamily;
    }

    if (fontWeight) {
        sanitizedHeading.fontWeight = fontWeight;
    }

    if (letterSpacing) {
        sanitizedHeading.letterSpacing = letterSpacing;
    }

    if (color) {
        sanitizedHeading.color = color;
    }

    if (Object.keys(sanitizedHeading).length === 0) {
        return undefined;
    }

    return sanitizedHeading;
}

export function sanitizeEditorHeadingMap(
    headings: EditorHeadingMap | undefined,
): EditorHeadingMap {
    const sanitizedHeadings: EditorHeadingMap = {};

    for (const level of ORDERED_HEADING_LEVELS) {
        const sanitizedHeading = sanitizeEditorHeading(headings?.[level]);

        if (sanitizedHeading) {
            sanitizedHeadings[level] = sanitizedHeading;
        }
    }

    return sanitizedHeadings;
}

export function buildHeadingDraft(
    headings: EditorHeadingMap | undefined,
): EditorHeadingMap {
    const sanitizedHeadings = sanitizeEditorHeadingMap(headings);
    const visibleLevels = getVisibleHeadingLevels(sanitizedHeadings);
    const draft: EditorHeadingMap = {};

    for (const level of visibleLevels) {
        draft[level] = sanitizedHeadings[level] ?? {};
    }

    return draft;
}

export function getVisibleHeadingLevels(
    headings: EditorHeadingMap | undefined,
): EditorHeadings[] {
    const sanitizedHeadings = sanitizeEditorHeadingMap(headings);
    let lastVisibleIndex = DEFAULT_VISIBLE_HEADING_LEVELS.length - 1;

    for (
        let levelIndex = DEFAULT_VISIBLE_HEADING_LEVELS.length;
        levelIndex < ORDERED_HEADING_LEVELS.length;
        levelIndex += 1
    ) {
        const level = ORDERED_HEADING_LEVELS[levelIndex];

        if (sanitizedHeadings[level]) {
            lastVisibleIndex = levelIndex;
        }
    }

    return ORDERED_HEADING_LEVELS.slice(0, lastVisibleIndex + 1);
}

export function getNextHeadingLevel(
    visibleLevels: EditorHeadings[],
): EditorHeadings | null {
    for (const level of ORDERED_HEADING_LEVELS) {
        if (!visibleLevels.includes(level)) {
            return level;
        }
    }

    return null;
}

export function buildHeadingStyleAttribute(
    heading: EditorHeading | undefined,
): string | undefined {
    const sanitizedHeading = sanitizeEditorHeading(heading);

    if (!sanitizedHeading) {
        return undefined;
    }

    const styleDeclarations: string[] = [];

    if (sanitizedHeading.fontSize) {
        styleDeclarations.push(`font-size: ${sanitizedHeading.fontSize}`);
    }

    if (sanitizedHeading.fontFamily) {
        styleDeclarations.push(`font-family: ${sanitizedHeading.fontFamily}`);
    }

    if (sanitizedHeading.fontWeight) {
        styleDeclarations.push(`font-weight: ${sanitizedHeading.fontWeight}`);
    }

    if (sanitizedHeading.letterSpacing) {
        styleDeclarations.push(
            `letter-spacing: ${sanitizedHeading.letterSpacing}`,
        );
    }

    if (sanitizedHeading.color) {
        styleDeclarations.push(`color: ${sanitizedHeading.color}`);
    }

    if (styleDeclarations.length === 0) {
        return undefined;
    }

    return `${styleDeclarations.join("; ")};`;
}
