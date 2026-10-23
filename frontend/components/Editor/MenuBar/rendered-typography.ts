import type { Editor } from "@tiptap/core";

/**
 * The font family and size the browser rendered the text at the cursor in,
 * read from the computed style of the DOM element there. Each field is absent
 * when it cannot be read (no mounted view, or no computed value, as in jsdom
 * for stylesheet rules), so callers fall back to the configured values.
 */
export interface RenderedTypography {
  /** First family of the computed `font-family` stack, unquoted. */
  fontFamily?: string;
  /** Computed `font-size` in px without the unit, rounded to one decimal. */
  fontSize?: string;
}

/** Returns the first family of a `font-family` value, with quotes removed. */
export function firstFontFamily(value: string): string | undefined {
  const first = value
    .split(",")[0]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  return first ? first : undefined;
}

/** Formats a computed `font-size` such as "18.72px" as "18.7". */
export function formatRenderedFontSize(value: string): string | undefined {
  if (!value.trim().endsWith("px")) return undefined;
  const px = Number.parseFloat(value);
  if (!Number.isFinite(px) || px <= 0) return undefined;
  return String(Math.round(px * 10) / 10);
}

function elementAtCursor(editor: Editor): Element | null {
  try {
    const { node } = editor.view.domAtPos(editor.state.selection.from);
    return node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  } catch {
    // The view is not mounted (TipTap throws on `editor.view` access before
    // mount) or the position has no DOM yet: nothing rendered to read.
    return null;
  }
}

/** Reads the rendered typography at the cursor (see {@link RenderedTypography}). */
export function readRenderedTypography(editor: Editor): RenderedTypography {
  const element = elementAtCursor(editor);
  if (!element) return {};
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return {};
  return {
    fontFamily: firstFontFamily(style.fontFamily),
    fontSize: formatRenderedFontSize(style.fontSize),
  };
}
