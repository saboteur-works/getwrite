/**
 * @module annotation-remap
 *
 * Pure id-remap for annotations (Feature 101, FR-21, OQ-14). Copying or
 * duplicating a resource, and pasting annotated text (FR-19), must give the
 * new place its own annotation ids so no id is ever shared between
 * resources. Every id found in the sidecar array or in an `annotation` mark
 * maps to exactly one fresh id, applied to both, so the pair stays joined.
 *
 * - A body with no mark (detached) is copied under a new id and stays detached.
 * - A mark with no body is kept, under a new id (so no id is shared); it is
 *   inert exactly as in the source (FR-18) and the text it covers is unchanged.
 * - A mark without a string `id` is left as it is.
 * - Nothing is mutated and nothing is read, written or logged.
 */
import { generateUUID } from "./uuid";
import type {
  Annotation,
  TipTapDocument,
  TipTapMark,
  TipTapNode,
} from "./types";

export interface RemappedAnnotations {
  /** The annotations with fresh ids; body, quote and timestamps copied. */
  annotations: Annotation[];
  /** The document with every annotation mark pointing at the fresh ids. */
  document: TipTapDocument | undefined;
  /** Source id to new id, for every id seen in either place. */
  idMap: ReadonlyMap<string, string>;
}

const ANNOTATION_MARK = "annotation";

function markId(mark: TipTapMark): string | null {
  if (mark.type !== ANNOTATION_MARK) return null;
  const id = mark.attrs?.id;
  return typeof id === "string" ? id : null;
}

function collectMarkIds(node: TipTapNode, into: Set<string>): void {
  for (const mark of node.marks ?? []) {
    const id = markId(mark);
    if (id !== null) into.add(id);
  }
  for (const child of node.content ?? []) collectMarkIds(child, into);
}

function remapNode(node: TipTapNode, idMap: Map<string, string>): TipTapNode {
  const next: TipTapNode = { ...node };
  if (node.marks) {
    next.marks = node.marks.map((mark) => {
      const id = markId(mark);
      const fresh = id === null ? undefined : idMap.get(id);
      return fresh === undefined
        ? mark
        : { ...mark, attrs: { ...mark.attrs, id: fresh } };
    });
  }
  if (node.content) {
    next.content = node.content.map((child) => remapNode(child, idMap));
  }
  return next;
}

/**
 * @param annotations - the source sidecar annotations
 * @param document - the source TipTap document, if any
 * @param newId - id source; injectable for tests, defaults to a UUID
 */
export function remapAnnotationIds(
  annotations: readonly Annotation[],
  document: TipTapDocument | undefined,
  newId: () => string = generateUUID,
): RemappedAnnotations {
  const sourceIds = new Set<string>(annotations.map((a) => a.id));
  if (document) {
    for (const node of document.content) collectMarkIds(node, sourceIds);
  }

  const idMap = new Map<string, string>();
  for (const id of sourceIds) idMap.set(id, newId());

  return {
    annotations: annotations.map((a) => ({ ...a, id: idMap.get(a.id)! })),
    document: document
      ? {
          ...document,
          content: document.content.map((n) => remapNode(n, idMap)),
        }
      : undefined,
    idMap,
  };
}
