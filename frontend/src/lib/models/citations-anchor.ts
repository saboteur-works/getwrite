/**
 * @module citations-anchor
 *
 * Feature 116 (citations at compile), FR-11: pure placement of each
 * citation's note or in-text reference in a TipTap document. Reads the
 * document and returns positions; it never mutates it and never changes the
 * text of a cited passage. No React, JSX, JSON, `node:*` or engine import.
 *
 * Where the mark's end is available (`experiments/task-12.md`): each text
 * node carries `marks: [{ type: "annotation", attrs: { id } }]`; `plainText`
 * carries no mark information, so placement works over the TipTap tree. The
 * mark's end is the end of the last text node, in document order, that
 * carries the id.
 *
 * For a note style, when the node right after that end (the next sibling,
 * and only if it is a text node) starts with `.`, `,`, `;`, `:`, `?`, `!` or
 * a closing quote, the anchor goes after that one character.
 */
import type { TipTapDocument, TipTapNode } from "./types";

/** Characters a note anchor moves past when they directly follow a mark. */
export const NOTE_TRAILING_CHARACTERS: readonly string[] = [
  ".",
  ",",
  ";",
  ":",
  "?",
  "!",
  '"',
  "'",
  "”",
  "’",
];

/** Where one citation's anchor sits. */
export interface CitationAnchor {
  annotationId: string;
  /** Child indices from the document down to the text node holding the anchor. */
  path: readonly number[];
  /** UTF-16 offset in that text node's `text`; the anchor goes after this many characters. */
  offset: number;
}

export interface PlaceAnchorsOptions {
  /** True for a note style: step past one trailing punctuation or quote character. */
  noteStyle: boolean;
}

export interface PlaceAnchorsResult<T extends { annotationId: string }> {
  /** Anchors in document order of each mark's first text node. */
  placed: CitationAnchor[];
  /** Citations whose mark is absent from the document; never dropped silently. */
  unplaced: T[];
}

interface MarkEnd {
  path: number[];
  length: number;
  /** The next sibling's path and first character, when it is a non-empty text node. */
  next?: { path: number[]; first: string };
}

function markIds(node: TipTapNode): string[] {
  const ids: string[] = [];
  for (const mark of node.marks ?? []) {
    const id = mark.attrs?.id;
    if (mark.type === "annotation" && typeof id === "string") ids.push(id);
  }
  return ids;
}

/** Walk in document order, recording the latest end seen for each wanted id. */
function walk(
  nodes: readonly TipTapNode[],
  path: number[],
  wanted: ReadonlySet<string>,
  ends: Map<string, MarkEnd>,
  firstSeen: string[],
): void {
  nodes.forEach((node, index) => {
    const here = [...path, index];
    if (node.type === "text" && typeof node.text === "string") {
      for (const id of markIds(node)) {
        if (!wanted.has(id)) continue;
        if (!ends.has(id)) firstSeen.push(id);
        const sibling = nodes[index + 1];
        const first =
          sibling?.type === "text" ? (sibling.text ?? "").charAt(0) : "";
        ends.set(id, {
          path: here,
          length: node.text.length,
          ...(first === ""
            ? {}
            : { next: { path: [...path, index + 1], first } }),
        });
      }
      return;
    }
    if (node.content !== undefined) {
      walk(node.content, here, wanted, ends, firstSeen);
    }
  });
}

/**
 * Place an anchor for each citation at the end of its `annotation` mark
 * range. A mark with no citation in `citations` is not touched; a citation
 * whose mark is not in the document is returned in `unplaced`.
 */
export function placeCitationAnchors<T extends { annotationId: string }>(
  document: TipTapDocument | undefined,
  citations: readonly T[],
  options: PlaceAnchorsOptions,
): PlaceAnchorsResult<T> {
  const wanted = new Set(citations.map((c) => c.annotationId));
  const ends = new Map<string, MarkEnd>();
  const order: string[] = [];
  if (document !== undefined) walk(document.content, [], wanted, ends, order);

  const placed: CitationAnchor[] = [];
  for (const annotationId of order) {
    const end = ends.get(annotationId);
    if (end === undefined) continue;
    const shouldStep =
      options.noteStyle &&
      end.next !== undefined &&
      NOTE_TRAILING_CHARACTERS.includes(end.next.first);
    placed.push(
      shouldStep && end.next !== undefined
        ? { annotationId, path: end.next.path, offset: 1 }
        : { annotationId, path: end.path, offset: end.length },
    );
  }
  const unplaced = citations.filter((c) => !ends.has(c.annotationId));
  return { placed, unplaced };
}
