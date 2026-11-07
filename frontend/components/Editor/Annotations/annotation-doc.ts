/**
 * @module annotation-doc
 *
 * Pure reads of the `annotation` marks in a ProseMirror document (Feature 101,
 * FR-14, FR-16). No transaction is created and nothing is written.
 */
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

/** The span of text that carries one annotation's mark. */
export interface AnnotationRange {
  id: string;
  from: number;
  to: number;
}

const MARK_NAME = "annotation";

function annotationIdOf(mark: Mark): string | null {
  if (mark.type.name !== MARK_NAME) return null;
  const id: unknown = mark.attrs.id;
  return typeof id === "string" && id !== "" ? id : null;
}

/**
 * One range per annotation id present in `doc`: from the start of the first
 * marked text node to the end of the last. A mark with no id is ignored.
 */
export function collectAnnotationRanges(
  doc: ProseMirrorNode,
): Map<string, AnnotationRange> {
  const ranges = new Map<string, AnnotationRange>();
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      const id = annotationIdOf(mark);
      if (id === null) continue;
      const from = pos;
      const to = pos + node.nodeSize;
      const known = ranges.get(id);
      ranges.set(
        id,
        known
          ? { id, from: Math.min(known.from, from), to: Math.max(known.to, to) }
          : { id, from, to },
      );
    }
  });
  return ranges;
}

/**
 * Ids of the annotations the caret (or selection) is inside. At the edge of a
 * passage the caret is outside it (the mark is not inclusive).
 */
export function annotationIdsAtSelection(state: EditorState): string[] {
  const { from, to, empty: isEmpty, $from } = state.selection;
  const ids = new Set<string>();
  const collect = (marks: readonly Mark[]): void => {
    for (const mark of marks) {
      const id = annotationIdOf(mark);
      if (id !== null) ids.add(id);
    }
  };
  if (isEmpty) {
    collect($from.marks());
  } else {
    state.doc.nodesBetween(from, to, (node) => {
      if (node.isText) collect(node.marks);
    });
  }
  return [...ids];
}
