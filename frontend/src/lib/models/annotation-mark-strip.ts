/**
 * @module annotation-mark-strip
 *
 * Pure removal of `annotation` marks whose id has no body (Feature 101,
 * FR-17). Used only when a revision is restored (OQ-11): at ordinary load a
 * body-less mark is inert and the document is never rewritten.
 *
 * Only the `annotation` marks named by the caller are dropped. Text, node
 * structure and every other mark are left as they were, and a body is never
 * touched here.
 */

const ANNOTATION_MARK = "annotation";

type JsonValue = unknown;

interface MarkLike {
  type?: unknown;
  attrs?: { id?: unknown };
}

interface NodeLike {
  marks?: unknown;
  content?: unknown;
  [key: string]: JsonValue;
}

export interface StripResult {
  /** The document, rebuilt only where a mark was removed. */
  doc: unknown;
  /** How many marks were removed. */
  removed: number;
}

function isBodyless(mark: MarkLike, knownIds: ReadonlySet<string>): boolean {
  if (mark.type !== ANNOTATION_MARK) return false;
  const id = mark.attrs?.id;
  return typeof id !== "string" || !knownIds.has(id);
}

function stripNode(
  node: unknown,
  knownIds: ReadonlySet<string>,
  counter: { removed: number },
): unknown {
  if (node === null || typeof node !== "object") return node;
  const source = node as NodeLike;
  let next: NodeLike = source;

  if (Array.isArray(source.marks)) {
    const marks = source.marks as MarkLike[];
    const kept = marks.filter(
      (mark) =>
        mark === null ||
        typeof mark !== "object" ||
        !isBodyless(mark, knownIds),
    );
    if (kept.length !== marks.length) {
      counter.removed += marks.length - kept.length;
      const { marks: _dropped, ...rest } = source;
      void _dropped;
      next = kept.length > 0 ? { ...rest, marks: kept } : rest;
    }
  }

  if (Array.isArray(source.content)) {
    const children = source.content as unknown[];
    const mapped = children.map((child) => stripNode(child, knownIds, counter));
    if (mapped.some((child, i) => child !== children[i])) {
      next = { ...next, content: mapped };
    }
  }

  return next;
}

/**
 * Remove every `annotation` mark whose id is not in `knownIds` from a TipTap
 * document. Returns the same `doc` object when nothing was removed.
 */
export function stripBodylessAnnotationMarks(
  doc: unknown,
  knownIds: ReadonlySet<string>,
): StripResult {
  const counter = { removed: 0 };
  const stripped = stripNode(doc, knownIds, counter);
  return {
    doc: counter.removed === 0 ? doc : stripped,
    removed: counter.removed,
  };
}
