import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const WIKI_LINK_REGEX = /\[\[[^\]\n]+\]\]/g;

export function buildWikiLinkDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    let match: RegExpExecArray | null;
    WIKI_LINK_REGEX.lastIndex = 0;
    while ((match = WIKI_LINK_REGEX.exec(node.text))) {
      const from = pos + match.index;
      const to = from + match[0].length;
      decorations.push(Decoration.inline(from, to, { class: "wiki-link" }));
    }
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Decorates wiki-style links (`[[Target]]`) in the editor with a `wiki-link`
 * CSS class so they render with link styling. Does not modify the underlying
 * document — purely a visual decoration applied on each transaction.
 */
const WikiLinkDecoration = Extension.create({
  name: "wikiLinkDecoration",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("wikiLinkDecoration"),
        state: {
          init: (_, { doc }) => buildWikiLinkDecorations(doc),
          apply: (tr, old) =>
            tr.docChanged ? buildWikiLinkDecorations(tr.doc) : old,
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

export default WikiLinkDecoration;
