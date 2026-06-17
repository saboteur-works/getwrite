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

export const DEFAULT_HEADING_CONFIG: EditorHeadingMap = {
  h1: {
    fontSize: "40px",
    fontFamily: "IBM Plex Serif",
    fontWeight: "700",
    letterSpacing: "0.01em",
  },
  h2: { fontSize: "28px", fontFamily: "IBM Plex Serif", fontWeight: "700" },
  h3: { fontSize: "20px", fontFamily: "IBM Plex Serif", fontWeight: "500" },
};

export const DEFAULT_VISIBLE_HEADING_LEVELS: EditorHeadings[] = [
  "h1",
  "h2",
  "h3",
];

export const HEADING_FIELD_DEFINITIONS: EditorHeadingFieldDefinition[] = [
  { key: "fontSize", label: "Font Size", placeholder: "e.g. 32px" },
  {
    key: "fontFamily",
    label: "Font Family",
    placeholder: "e.g. IBM Plex Sans",
  },
  { key: "fontWeight", label: "Font Weight", placeholder: "e.g. 700" },
  { key: "letterSpacing", label: "Letter Spacing", placeholder: "e.g. 0.08em" },
  {
    key: "color",
    label: "Color",
    placeholder: "e.g. #D44040", // GW-HEX-EXEMPT: placeholder example text — not a live color value
  },
];

function normalizeHeadingValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function sanitizeEditorHeading(
  heading: EditorHeading | undefined,
): EditorHeading | undefined {
  if (!heading) {
    return undefined;
  }

  const sanitizedHeading = Object.fromEntries(
    HEADING_FIELD_DEFINITIONS.flatMap(({ key }) => {
      const value = normalizeHeadingValue(heading[key]);
      return value ? [[key, value]] : [];
    }),
  ) as EditorHeading;

  return Object.keys(sanitizedHeading).length > 0
    ? sanitizedHeading
    : undefined;
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

const CSS_PROPERTY_NAMES: Record<EditorHeadingFieldKey, string> = {
  fontSize: "font-size",
  fontFamily: "font-family",
  fontWeight: "font-weight",
  letterSpacing: "letter-spacing",
  color: "color",
};

export function buildHeadingStyleAttribute(
  heading: EditorHeading | undefined,
): string | undefined {
  const sanitizedHeading = sanitizeEditorHeading(heading);

  if (!sanitizedHeading) {
    return undefined;
  }

  const declarations = (
    Object.entries(sanitizedHeading) as [EditorHeadingFieldKey, string][]
  ).map(([key, value]) => `${CSS_PROPERTY_NAMES[key]}: ${value}`);

  return declarations.length > 0 ? `${declarations.join("; ")};` : undefined;
}
