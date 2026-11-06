import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";

/**
 * @module annotation-clipboard
 *
 * Feature 101, Task 20 (FR-19 proof half, OQ-12): records the last clipboard
 * operation made in an editor, from the editor's `cut` and `copy` DOM
 * handlers, so a later paste can tell a cut from a copy. The clipboard is
 * shared by every editor in the window, so the record is module-level.
 *
 * Records the operation, the ids of the annotation marks on the selected
 * text, and the source resource id. It records every non-empty cut or copy,
 * annotated or not, so a later plain copy replaces an earlier annotated cut.
 * It does not read or write the clipboard and contains no paste logic.
 */

type ClipboardOperationKind = "cut" | "copy";

export interface ClipboardOperation {
  readonly kind: ClipboardOperationKind;
  /** Distinct annotation ids on the selected text, in document order. */
  readonly annotationIds: readonly string[];
  /** The resource the text was cut or copied from; null when not known. */
  readonly sourceResourceId: string | null;
}

let lastOperation: ClipboardOperation | null = null;

export function getLastClipboardOperation(): ClipboardOperation | null {
  return lastOperation;
}

export function clearLastClipboardOperation(): void {
  lastOperation = null;
}

/** Distinct annotation ids on the selection, or null for an empty selection. */
function annotationIdsInSelection(state: EditorState): string[] | null {
  const { from, to } = state.selection;
  if (state.selection.empty) return null;
  const ids: string[] = [];
  state.doc.nodesBetween(from, to, (node) => {
    for (const mark of node.marks) {
      const id: unknown = mark.attrs.id;
      if (
        mark.type.name === "annotation" &&
        typeof id === "string" &&
        !ids.includes(id)
      ) {
        ids.push(id);
      }
    }
  });
  return ids;
}

interface AnnotationClipboardOptions {
  /** Returns the id of the resource the editor is showing, if known. */
  getResourceId: () => string | null;
}

const ANNOTATION_CLIPBOARD_KEY = new PluginKey("annotationClipboard");

const AnnotationClipboard = Extension.create<AnnotationClipboardOptions>({
  name: "annotationClipboard",

  addOptions() {
    return { getResourceId: () => null };
  },

  addProseMirrorPlugins() {
    const record = (kind: ClipboardOperationKind, state: EditorState): void => {
      const annotationIds = annotationIdsInSelection(state);
      if (annotationIds === null) return;
      lastOperation = {
        kind,
        annotationIds,
        sourceResourceId: this.options.getResourceId(),
      };
    };
    return [
      new Plugin({
        key: ANNOTATION_CLIPBOARD_KEY,
        props: {
          // Runs before ProseMirror's own handler, which deletes the
          // selection on cut; returning false leaves that handler to run.
          handleDOMEvents: {
            cut: (view) => {
              record("cut", view.state);
              return false;
            },
            copy: (view) => {
              record("copy", view.state);
              return false;
            },
          },
        },
      }),
    ];
  },
});

export default AnnotationClipboard;
