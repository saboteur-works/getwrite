import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * @module offset-resolver
 *
 * Resolves a plain-text character offset — the unit entity mentions are
 * recorded at (`entity-detection.ts`, the mention index) — against the live,
 * unsaved ProseMirror document into a ProseMirror document position, per
 * FR-3 of entity-mention-navigation.
 *
 * ProseMirror node-boundary positions are not plain-text character counts:
 * every non-text node (a paragraph's own open/close tokens, an inline atom
 * like `hardBreak`) consumes position space without consuming any
 * plain-text characters. Walking the document by position alone would
 * therefore drift from a plain-text offset as soon as the document has more
 * than one block or inline-break node — this module exists to bridge that
 * gap.
 *
 * The plain-text model this module builds deliberately mirrors
 * `tiptapToPlainText` (`src/lib/tiptap-text.ts`), the function that produced
 * the plain text a persisted mention offset was originally measured
 * against: each `paragraph`/`heading` node contributes one synthetic `"\n"`
 * after its own content, no other node type contributes a separator, and
 * any run of trailing `"\n"`s is dropped from the very end of the document
 * (`tiptapToPlainText`'s `.replace(/\n+$/g, "")`). Matching that trim here
 * is what keeps a boundary offset's null-vs-resolved answer consistent with
 * the plain text the offset was computed from, rather than silently
 * accepting a few extra trailing positions `tiptapToPlainText` itself would
 * have trimmed away.
 */

/**
 * Walks `node`'s descendants, mirroring `tiptapToPlainText`'s traversal
 * exactly, and records one plain-text character plus the ProseMirror
 * position it resolves to for every character produced — including the
 * synthetic `"\n"` appended after a `paragraph`/`heading` node's own
 * content, which resolves to that node's own end-of-content position (the
 * position immediately before its closing token, a valid position to place
 * a cursor at).
 *
 * `pos` is always the position immediately before `node` itself starts
 * (i.e. before its own opening token for a non-text node, or its first
 * character's position for a text node) — the same convention
 * `Node.descendants`/`Node.forEach` position callbacks use elsewhere in
 * this codebase (see `entityHighlightDecoration.ts`'s `collectTextBlocks`).
 */
function visitNode(
  node: ProseMirrorNode,
  pos: number,
  chars: string[],
  positions: number[],
): void {
  if (node.isText) {
    const text = node.text ?? "";
    for (let i = 0; i < text.length; i++) {
      chars.push(text[i]);
      positions.push(pos + i);
    }
    return;
  }

  // A leaf, non-text node (e.g. `hardBreak`) has no content to recurse into
  // and contributes zero plain-text characters, but it still occupies one
  // position — already accounted for by the `offsetInParent` a sibling's
  // own `forEach` offset carries, so nothing further is needed here.
  if (node.content.size > 0) {
    node.forEach((child, offsetInParent) => {
      visitNode(child, pos + 1 + offsetInParent, chars, positions);
    });
  }

  if (node.type.name === "paragraph" || node.type.name === "heading") {
    chars.push("\n");
    positions.push(pos + node.nodeSize - 1);
  }
}

/**
 * Builds the full plain-text-character-to-ProseMirror-position mapping for
 * `doc`, trimmed of trailing synthetic newlines to match
 * `tiptapToPlainText`'s own trim.
 */
function buildOffsetPositionTable(doc: ProseMirrorNode): number[] {
  const chars: string[] = [];
  const positions: number[] = [];

  doc.forEach((child, offsetInParent) => {
    visitNode(child, offsetInParent, chars, positions);
  });

  while (chars.length > 0 && chars[chars.length - 1] === "\n") {
    chars.pop();
    positions.pop();
  }

  return positions;
}

/**
 * Resolves a plain-text character offset against `doc`'s own plain-text
 * content into a ProseMirror document position.
 *
 * Pure and synchronous: performs no I/O and reads nothing beyond the
 * document passed in.
 *
 * @param doc - The ProseMirror document to resolve against (typically the
 *   live editor's current `state.doc`).
 * @param offset - A zero-based plain-text character offset, in the same
 *   units `entity-detection.ts` records a mention's offset in.
 * @returns The matching ProseMirror document position, or `null` when
 *   `offset` is negative, not an integer, or at or beyond the document's
 *   own plain-text length (per `tiptapToPlainText`'s trailing-newline trim)
 *   — never clamped to the nearest valid position, and never thrown.
 */
export function resolveOffsetToPosition(
  doc: ProseMirrorNode,
  offset: number,
): number | null {
  if (!Number.isInteger(offset) || offset < 0) return null;

  const positions = buildOffsetPositionTable(doc);
  if (offset >= positions.length) return null;

  return positions[offset];
}
