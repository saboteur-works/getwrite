/**
 * @module annotation-mark-ids
 *
 * Pure scan of a stored TipTap JSON document for the ids of its `annotation`
 * marks. Used by the claim list to tell a claim whose passage is still marked
 * from a detached one without loading the editor. No React, JSX or JSON import:
 * reachable from `core.ts`.
 */
const ANNOTATION_MARK = "annotation";

/** Every annotation-mark id carried by any node of the document. */
export function collectAnnotationMarkIds(doc: unknown): Set<string> {
  const ids = new Set<string>();
  const stack: unknown[] = [doc];
  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node !== "object" || node === null) continue;
    const { marks, content } = node as { marks?: unknown; content?: unknown };
    if (Array.isArray(marks)) {
      for (const mark of marks as {
        type?: unknown;
        attrs?: { id?: unknown };
      }[]) {
        if (
          mark !== null &&
          typeof mark === "object" &&
          mark.type === ANNOTATION_MARK &&
          typeof mark.attrs?.id === "string"
        ) {
          ids.add(mark.attrs.id);
        }
      }
    }
    if (Array.isArray(content)) stack.push(...content);
  }
  return ids;
}
