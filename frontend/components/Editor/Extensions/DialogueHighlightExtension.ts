import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  dialogueSpans,
  type DialogueQuoteStyle,
} from "../../../src/lib/models/prose-diagnostics";
import { buildPlainTextIndex } from "../offset-resolver";

/**
 * @module DialogueHighlightExtension
 *
 * A view-only highlight over quoted speech in the live document, switched on
 * from the sidebar's Prose Diagnostics section. Like
 * `EntityHighlightDecorationExtension`, it only produces `Decoration.inline`
 * markers: it never changes the document and reads or writes no file.
 *
 * Spans come from `prose-diagnostics.ts`'s `dialogueSpans`, measured on the
 * document's plain text (`offset-resolver.ts`'s `buildPlainTextIndex`, the
 * same text model mention offsets use), so the double-quote highlight marks
 * exactly what the Dialogue ratio counts. Settings are read through a getter
 * so the editor instance survives a toggle; the host dispatches a meta
 * transaction on {@link DIALOGUE_HIGHLIGHT_KEY} to recompute.
 */

/** The session-only highlight settings the sidebar controls. */
export interface DialogueHighlightSettings {
  isEnabled: boolean;
  quoteStyle: DialogueQuoteStyle;
}

/** Options accepted by {@link DialogueHighlightExtension}'s `.configure(...)`. */
export interface DialogueHighlightOptions {
  /** Returns the current settings; read on every recompute. */
  getSettings: () => DialogueHighlightSettings;
}

/** CSS class on each highlighted span (`styles/editor.css`). */
const DIALOGUE_HIGHLIGHT_CLASS = "dialogue-highlight";

/**
 * Builds the decorations for `doc`. Returns an empty set without scanning
 * when the highlight is off. A span that runs across paragraphs (an
 * unclosed double quote) is one inline decoration over that range.
 */
export function buildDialogueHighlightDecorations(
  doc: ProseMirrorNode,
  settings: DialogueHighlightSettings,
): DecorationSet {
  if (!settings.isEnabled) return DecorationSet.empty;

  const { text, positions } = buildPlainTextIndex(doc);
  const decorations = dialogueSpans(text, settings.quoteStyle).flatMap(
    ({ start, end }) => {
      const from = positions[start];
      const last = positions[end - 1];
      if (from === undefined || last === undefined) return [];
      return [
        Decoration.inline(from, last + 1, { class: DIALOGUE_HIGHLIGHT_CLASS }),
      ];
    },
  );
  return decorations.length === 0
    ? DecorationSet.empty
    : DecorationSet.create(doc, decorations);
}

/**
 * Plugin key; a host dispatches `tr.setMeta(DIALOGUE_HIGHLIGHT_KEY, true)`
 * to recompute after the settings change (the document itself unchanged).
 */
export const DIALOGUE_HIGHLIGHT_KEY = new PluginKey("dialogueHighlight");

const DialogueHighlightExtension = Extension.create<DialogueHighlightOptions>({
  name: "dialogueHighlight",

  addOptions(): DialogueHighlightOptions {
    return { getSettings: () => ({ isEnabled: false, quoteStyle: "double" }) };
  },

  addProseMirrorPlugins() {
    const { getSettings } = this.options;
    return [
      new Plugin({
        key: DIALOGUE_HIGHLIGHT_KEY,
        state: {
          init: (_, { doc }) =>
            buildDialogueHighlightDecorations(doc, getSettings()),
          apply: (tr, old) =>
            tr.docChanged || tr.getMeta(DIALOGUE_HIGHLIGHT_KEY)
              ? buildDialogueHighlightDecorations(tr.doc, getSettings())
              : old,
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

export default DialogueHighlightExtension;
