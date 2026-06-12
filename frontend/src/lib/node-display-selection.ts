/**
 * @module node-display-selection
 *
 * ProseMirror adapter for the Node Display indicator. Turns a live editor
 * selection into the {@link NodeAncestry} descriptors consumed by the pure
 * labeling logic in {@link module:node-display}, then resolves the ordered,
 * de-duplicated set of node-type labels for that selection.
 *
 * This is the only Node Display module that depends on ProseMirror; keeping the
 * traversal here lets {@link module:node-display} stay editor-free and trivially
 * unit-testable.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import {
  deriveNodeTypeLabels,
  type AncestorNode,
  type NodeAncestry,
} from "./node-display";

/**
 * Collect the ancestry of every textblock the `[from, to]` range touches, in
 * document order.
 *
 * For each leaf textblock (paragraph, heading, code block) the full ancestor
 * chain is resolved via {@link ProseMirrorNode.resolve}, so arbitrarily nested
 * structures (e.g. a paragraph inside a list item inside a bullet list) carry
 * the enclosing container needed to label them correctly. Non-textblock nodes
 * are descended into but not emitted as blocks of their own.
 *
 * @param doc - The document node to traverse.
 * @param from - Start position of the selection.
 * @param to - End position of the selection.
 * @returns One {@link NodeAncestry} (outermost → innermost) per touched block.
 */
export function nodeAncestriesFromSelection(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): NodeAncestry[] {
  const blocks: NodeAncestry[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    // Descend into containers; only leaf textblocks become their own block.
    if (!node.isTextblock) return undefined;
    const resolved = doc.resolve(pos);
    const ancestry: AncestorNode[] = [];
    for (let depth = 0; depth <= resolved.depth; depth++) {
      const ancestor = resolved.node(depth);
      ancestry.push({ name: ancestor.type.name, attrs: ancestor.attrs });
    }
    ancestry.push({ name: node.type.name, attrs: node.attrs });
    blocks.push(ancestry);
    return undefined;
  });
  return blocks;
}

/**
 * Resolve the node-type labels for an editor state's current selection.
 *
 * @param state - The editor state whose `selection` and `doc` are inspected.
 * @returns Distinct labels in document order (e.g. `["Heading 2", "Body"]`);
 *   an empty array when the selection touches no labelable block.
 */
export function deriveSelectionNodeLabels(state: EditorState): string[] {
  const { from, to } = state.selection;
  return deriveNodeTypeLabels(nodeAncestriesFromSelection(state.doc, from, to));
}
