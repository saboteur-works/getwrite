/**
 * Paragraph leading: the single rule for reading a stored `paragraphLeading`.
 *
 * An explicit leading is a JSON number greater than 0 and finite. Unset is an
 * absent attribute. The legacy `onCreate` stamp wrote the string "1.5" on every
 * paragraph, so that exact string reads as unset; any other legacy string that
 * names a finite number greater than 0 is honoured as an explicit choice.
 * Everything else reads as unset. Pure and in memory only: nothing here marks a
 * document changed.
 */

/** The only value the legacy stamp wrote. */
const LEGACY_STAMP = "1.5";

/** Minimal JSON shape of a TipTap node, enough to walk a stored document. */
export interface LeadingJsonNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: LeadingJsonNode[];
  [key: string]: unknown;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Returns the explicit leading as a number, or `null` when the value is unset. */
export function readParagraphLeading(value: unknown): number | null {
  if (typeof value === "number") {
    return isPositiveFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    if (value === LEGACY_STAMP) return null;
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return isPositiveFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeNode(node: LeadingJsonNode): LeadingJsonNode {
  let next: LeadingJsonNode = node;

  if (
    node.type === "paragraph" &&
    node.attrs &&
    "paragraphLeading" in node.attrs
  ) {
    const { paragraphLeading, ...rest } = node.attrs;
    const leading = readParagraphLeading(paragraphLeading);
    const attrs =
      leading === null ? rest : { ...rest, paragraphLeading: leading };
    const withoutAttrs: LeadingJsonNode = { ...node };
    delete withoutAttrs.attrs;
    next =
      Object.keys(attrs).length > 0 ? { ...withoutAttrs, attrs } : withoutAttrs;
  }

  if (Array.isArray(next.content)) {
    return { ...next, content: next.content.map(normalizeNode) };
  }
  return next;
}

/**
 * Returns a copy of a stored document with every paragraph's leading passed
 * through {@link readParagraphLeading}: legacy "1.5" and invalid values are
 * removed, other legacy strings become numbers. The input is not mutated.
 */
export function normalizeParagraphLeadingInDocument(
  doc: LeadingJsonNode,
): LeadingJsonNode {
  return normalizeNode(doc);
}
