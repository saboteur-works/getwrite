/**
 * @module node-display
 *
 * Pure derivation of human-readable node-type labels for the editor footer's
 * Node Display indicator. This module is the single source of truth for the
 * mapping from raw TipTap/ProseMirror node names to the labels shown to the
 * writer (e.g. `heading` → "Heading 2", `paragraph` → "Body").
 *
 * It is intentionally free of any editor/ProseMirror dependency: callers pass
 * in plain ancestry descriptors so the logic stays trivially unit-testable.
 * The adapter that turns a live ProseMirror selection into {@link NodeAncestry}
 * values lives with the editor wiring, not here.
 */

/** Label shown for a plain paragraph node. */
export const BODY_LABEL = "Body";

/**
 * Mapping from a recognized block-container node name to its display label.
 *
 * `paragraph` is deliberately excluded: it is the generic fallback ("Body") and
 * is only surfaced when no more specific container encloses it (see
 * {@link labelForAncestry}). `heading` is handled separately because its label
 * depends on the `level` attribute.
 */
export const NODE_TYPE_LABELS: Readonly<Record<string, string>> = {
  bulletList: "Bullet List",
  orderedList: "Ordered List",
  blockquote: "Blockquote",
  codeBlock: "Code Block",
};

/** Attributes carried by an ancestor node that affect its label. */
export interface AncestorNodeAttrs {
  /** Heading level (1–6) when the node is a heading. */
  level?: number | null;
  [key: string]: unknown;
}

/** A single node in a block's ancestry chain. */
export interface AncestorNode {
  /** Raw TipTap/ProseMirror node type name (e.g. "paragraph", "heading"). */
  name: string;
  /** Node attributes; only `level` is consulted for labeling. */
  attrs?: AncestorNodeAttrs;
}

/**
 * A block's ancestry, ordered outermost → innermost. The final element is the
 * block's own (textblock) type; earlier elements are its enclosing containers.
 * The document node may be included or omitted — unrecognized names are ignored.
 */
export type NodeAncestry = readonly AncestorNode[];

/**
 * Resolve the display label for a single node by name (and attributes).
 *
 * @returns The human-readable label, or `null` when the node type is not one
 *   the indicator names (e.g. `doc`, `text`, `listItem`).
 */
export function nodeTypeLabel(
  name: string,
  attrs?: AncestorNodeAttrs,
): string | null {
  if (name === "paragraph") return BODY_LABEL;
  if (name === "heading") {
    const level = attrs?.level;
    return typeof level === "number" ? `Heading ${level}` : "Heading";
  }
  return NODE_TYPE_LABELS[name] ?? null;
}

/**
 * Compute the single most meaningful label for one block, given its ancestry.
 *
 * The nearest enclosing *non-paragraph* recognized container wins, so a caret
 * inside a list item reads "Bullet List" rather than "Body". A plain paragraph
 * with no recognized container falls back to "Body". Unrecognized blocks (e.g.
 * a node type the indicator does not name) yield `null`.
 *
 * @param ancestry - Nodes ordered outermost → innermost.
 */
export function labelForAncestry(ancestry: NodeAncestry): string | null {
  let hasParagraph = false;
  // Scan innermost → outermost: the closest specific container takes priority.
  for (let i = ancestry.length - 1; i >= 0; i--) {
    const node = ancestry[i];
    if (node.name === "paragraph") {
      hasParagraph = true;
      continue;
    }
    const label = nodeTypeLabel(node.name, node.attrs);
    if (label !== null) return label;
  }
  return hasParagraph ? BODY_LABEL : null;
}

/**
 * Derive the ordered, de-duplicated list of node-type labels for a selection,
 * given the ancestry of each block the selection touches (in document order).
 *
 * - A caret (single block) yields a one-element list (e.g. `["Heading 2"]`).
 * - A selection spanning differing blocks yields each distinct label in
 *   document order (e.g. `["Heading 2", "Body"]`).
 * - Repeated labels are collapsed (two list items → `["Bullet List"]`).
 * - An empty input (no document / no selection) yields `[]`.
 *
 * @param blocks - Ancestry of each block in the selection, document order.
 */
export function deriveNodeTypeLabels(
  blocks: readonly NodeAncestry[],
): string[] {
  const labels: string[] = [];
  for (const ancestry of blocks) {
    const label = labelForAncestry(ancestry);
    if (label !== null && !labels.includes(label)) {
      labels.push(label);
    }
  }
  return labels;
}
