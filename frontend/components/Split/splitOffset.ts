import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { tiptapToPlainText } from "../../src/lib/tiptap-text";
import type { TipTapDocument } from "../../src/lib/models";

/**
 * @module splitOffset
 *
 * The plain-text offset of an editor position, counted the way the split
 * server counts (`split-cut.ts`, `split-eligibility.ts`): one unit per text
 * character and one more after each paragraph or heading, which is how
 * `tiptapToPlainText` builds the stored text. A ProseMirror position is not
 * that number: it also counts every node boundary.
 */

const LINE_BLOCK_TYPES: ReadonlySet<string> = new Set(["paragraph", "heading"]);

/**
 * Offset of ProseMirror position `pos` in the document's plain text.
 *
 * A text node counts the characters before `pos`; a paragraph or heading
 * counts one unit once `pos` is past its end (the cursor at the end of a
 * block's text is still before that block's line break). The result is capped
 * at the length of the plain text, which has its trailing line breaks removed.
 */
export function plainTextOffsetAtPosition(
  doc: ProseMirrorNode,
  pos: number,
): number {
  let offset = 0;
  doc.descendants((node, nodePos) => {
    if (nodePos >= pos) return false;
    if (node.isText) {
      offset += Math.min(node.nodeSize, pos - nodePos);
      return false;
    }
    if (
      LINE_BLOCK_TYPES.has(node.type.name) &&
      nodePos + node.nodeSize <= pos
    ) {
      offset += 1;
    }
    return true;
  });
  const total = tiptapToPlainText(doc.toJSON() as TipTapDocument).length;
  return Math.min(offset, total);
}
