import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * @module AnnotationHighlightExtension
 *
 * View-only highlight of annotated passages (Feature 101, FR-14, FR-18).
 * The `annotation` mark itself renders a bare span; this decoration is what
 * makes a passage visible, and only for ids that have a body (the ids the
 * host supplies). A mark whose id has no body therefore stays inert, and the
 * document is never changed: nothing here dispatches a document step.
 *
 * State is set only by meta ({@link setAnnotationHighlight}); the decorations
 * are rebuilt from the live document on every document change.
 */

interface HighlightState {
  ids: ReadonlySet<string>;
  activeId: string | null;
  decorations: DecorationSet;
}

interface HighlightMeta {
  ids?: readonly string[];
  activeId?: string | null;
}

const ANNOTATION_HIGHLIGHT_KEY = new PluginKey<HighlightState>(
  "annotationHighlight",
);

/** Class on every highlighted passage: tint plus a dotted underline. */
const ANNOTATION_HIGHLIGHT_CLASS = "annotation-highlight";
/** Added to the passage chosen in the panel: a solid, thicker underline. */
const ANNOTATION_HIGHLIGHT_ACTIVE_CLASS = "annotation-highlight--active";

function build(
  doc: ProseMirrorNode,
  ids: ReadonlySet<string>,
  activeId: string | null,
): DecorationSet {
  if (ids.size === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name !== "annotation") continue;
      const id: unknown = mark.attrs.id;
      if (typeof id !== "string" || !ids.has(id)) continue;
      const isActive = id === activeId;
      decorations.push(
        Decoration.inline(pos, pos + node.nodeSize, {
          class: isActive
            ? `${ANNOTATION_HIGHLIGHT_CLASS} ${ANNOTATION_HIGHLIGHT_ACTIVE_CLASS}`
            : ANNOTATION_HIGHLIGHT_CLASS,
          "data-annotation-highlight": id,
        }),
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}

const AnnotationHighlightExtension = Extension.create({
  name: "annotationHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightState>({
        key: ANNOTATION_HIGHLIGHT_KEY,
        state: {
          init: () => ({
            ids: new Set<string>(),
            activeId: null,
            decorations: DecorationSet.empty,
          }),
          apply(tr, old) {
            const meta = tr.getMeta(ANNOTATION_HIGHLIGHT_KEY) as
              | HighlightMeta
              | undefined;
            if (!meta && !tr.docChanged) return old;
            const ids = meta?.ids ? new Set(meta.ids) : old.ids;
            const activeId =
              meta && "activeId" in meta
                ? (meta.activeId ?? null)
                : old.activeId;
            return { ids, activeId, decorations: build(tr.doc, ids, activeId) };
          },
        },
        props: {
          decorations(state) {
            return ANNOTATION_HIGHLIGHT_KEY.getState(state)?.decorations;
          },
        },
      }),
    ];
  },
});

export default AnnotationHighlightExtension;

/**
 * Sets which annotation ids are highlighted and which one is active. Omit a
 * key to leave it as it is. A decoration-only transaction: no document step.
 */
export function setAnnotationHighlight(
  editor: Pick<Editor, "state" | "view">,
  next: HighlightMeta,
): void {
  editor.view.dispatch(editor.state.tr.setMeta(ANNOTATION_HIGHLIGHT_KEY, next));
}
