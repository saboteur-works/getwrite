import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const WIKI_LINK_REGEX = /\[\[[^\]\n]+\]\]/g;

/**
 * Matches a wiki link whose brackets have been backslash-escaped by the
 * Markdown serializer (e.g. `\[\[Target\]\]`). The serializer escapes `[` and
 * `]` because they are link syntax in Markdown, but a wiki link must export as
 * literal `[[Target]]` to remain a wiki link for other tools and on re-import.
 */
const ESCAPED_WIKI_LINK_REGEX = /\\\[\\\[([^\n]*?)\\\]\\\]/g;

/**
 * Restore literal `[[Target]]` wiki links in serialized Markdown by removing the
 * backslash escapes the Markdown serializer adds around their brackets. Wiki
 * links are plain text in the document (decoration-only, not a node or mark),
 * so they round-trip as text; this only fixes their rendered Markdown form.
 */
export function unescapeWikiLinkBrackets(markdown: string): string {
  return markdown.replace(
    ESCAPED_WIKI_LINK_REGEX,
    (_match, inner) => `[[${inner}]]`,
  );
}

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
