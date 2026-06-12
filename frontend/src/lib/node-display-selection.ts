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
  nodeTypeLabel,
  type AncestorNode,
  type NodeAncestry,
} from "./node-display";

/**
 * Build the ancestry a textblock needs in order to be labeled.
 *
 * The nearest-enclosing-container rule (see {@link labelForAncestry}) only has
 * to look past a block's *direct* parent when a paragraph is wrapped in an
 * **unrecognized** container (e.g. a list item, whose enclosing list supplies
 * the label). In every other case — a heading or code block (whose own type is
 * the label), or a paragraph sitting directly in the document root or in a
 * recognized container such as a blockquote — the direct parent that
 * {@link ProseMirrorNode.nodesBetween} hands us for free already determines the
 * label. Only the wrapped-paragraph case pays for the comparatively costly
 * {@link ProseMirrorNode.resolve}, which keeps bulk selections over ordinary
 * body text allocation-light and resolve-free.
 */
function ancestryForBlock(
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
  pos: number,
  parent: ProseMirrorNode | null,
): AncestorNode[] {
  const parentIsTransparent =
    node.type.name === "paragraph" &&
    parent !== null &&
    parent.type.name !== "doc" &&
    nodeTypeLabel(parent.type.name, parent.attrs) === null;

  if (!parentIsTransparent) {
    const ancestry: AncestorNode[] = [];
    if (parent) {
      ancestry.push({ name: parent.type.name, attrs: parent.attrs });
    }
    ancestry.push({ name: node.type.name, attrs: node.attrs });
    return ancestry;
  }

  const resolved = doc.resolve(pos);
  const ancestry: AncestorNode[] = [];
  for (let depth = 0; depth <= resolved.depth; depth++) {
    const ancestor = resolved.node(depth);
    ancestry.push({ name: ancestor.type.name, attrs: ancestor.attrs });
  }
  ancestry.push({ name: node.type.name, attrs: node.attrs });
  return ancestry;
}

/**
 * Collect the ancestry of every textblock the `[from, to]` range touches, in
 * document order.
 *
 * For each leaf textblock (paragraph, heading, code block) enough of the
 * ancestor chain is captured to find the enclosing container that labels it
 * (see {@link ancestryForBlock}), so arbitrarily nested structures (e.g. a
 * paragraph inside a list item inside a bullet list) are still labeled
 * correctly. Non-textblock nodes are descended into but not emitted as blocks
 * of their own.
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
  doc.nodesBetween(from, to, (node, pos, parent) => {
    // Descend into containers; only leaf textblocks become their own block.
    if (!node.isTextblock) return undefined;
    blocks.push(ancestryForBlock(doc, node, pos, parent));
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
