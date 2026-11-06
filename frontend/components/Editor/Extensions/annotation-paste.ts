import { Extension } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { Mark, Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  addAnnotation,
  listAnnotations,
} from "../../../src/lib/api/annotations";
import type { NewAnnotation } from "../../../src/lib/api/annotations";
import type { Annotation } from "../../../src/lib/models/types";
import { ANNOTATION_TRANSACTION_META } from "../../../src/lib/annotation-flows";
import { generateUUID } from "../../../src/lib/models/uuid";
import {
  getLastClipboardOperation,
  type ClipboardOperation,
} from "./annotation-clipboard";

/**
 * @module annotation-paste
 *
 * Feature 101, Task 21 (FR-19, OQ-12): what happens to annotation marks when
 * annotated text is pasted. The Task 20 recorder says what the last cut or
 * copy in this window was (kind, annotation ids, source resource id); the
 * pasted slice is compared with it.
 *
 * - Pasted ids that are not exactly the recorded ids (a paste from another
 *   application, a stale record, no record) or an editor with no resource id:
 *   the annotation marks are dropped and the text stays.
 * - Cut then paste in the SAME resource, with none of the ids left in the
 *   document: the marks keep their ids and nothing is written. If any id is
 *   still in the document (part of a passage was cut, or this is a second
 *   paste) the paste is a copy, so an id is never held by two passages.
 * - Any other paste of recorded ids (a copy, or a cut into another resource)
 *   gets a fresh id per source id. The body and quote come from the SOURCE
 *   resource's sidecar (read through the annotation transport) and are
 *   written to the target through the annotation transport, whose core
 *   validates them: nothing is taken from the clipboard but the ids, which are
 *   only looked up. A cut's source annotation is never touched: its text and
 *   mark have left the source document, so its body is simply detached.
 *
 * The fresh marks are applied by the paste itself and the body is written
 * afterwards, so for a moment the mark has no body (inert, FR-18). If the
 * copy cannot be written the fresh marks are removed again and the failure is
 * reported through `onResult`; the pasted text stays. No body, quote or error
 * text is logged.
 */

export interface AnnotationPasteApi {
  list(projectId: string, resourceId: string): Promise<Annotation[]>;
  add(
    projectId: string,
    resourceId: string,
    annotation: NewAnnotation,
  ): Promise<Annotation>;
}

export type AnnotationPasteResult =
  | { ok: true }
  | { ok: false; message: string };

interface AnnotationPasteOptions {
  /** The resource the editor is showing, or null when not known. */
  getResourceId: () => string | null;
  getProjectId: () => string | null;
  api: AnnotationPasteApi;
  /** Called once per paste whose copy was written (or refused). */
  onResult: (result: AnnotationPasteResult) => void;
}

type AnnotationPastePlan =
  | { kind: "none" }
  | { kind: "drop" }
  | { kind: "keep" }
  | {
      kind: "copy";
      sourceResourceId: string;
      /** Source id to fresh id. */
      idMap: ReadonlyMap<string, string>;
    };

interface AnnotationPasteInput {
  pastedIds: readonly string[];
  record: ClipboardOperation | null;
  targetResourceId: string | null;
  /** Annotation ids already on text in the target document. */
  idsInDocument: ReadonlySet<string>;
  newId: () => string;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Pure decision for one paste; see the module comment for the rules. */
function planAnnotationPaste(input: AnnotationPasteInput): AnnotationPastePlan {
  const { pastedIds, record, targetResourceId, idsInDocument } = input;
  if (pastedIds.length === 0) return { kind: "none" };
  if (
    record === null ||
    targetResourceId === null ||
    record.sourceResourceId === null ||
    !sameIds(pastedIds, record.annotationIds)
  ) {
    return { kind: "drop" };
  }
  if (
    record.kind === "cut" &&
    record.sourceResourceId === targetResourceId &&
    !pastedIds.some((id) => idsInDocument.has(id))
  ) {
    return { kind: "keep" };
  }
  const idMap = new Map<string, string>();
  for (const id of pastedIds) idMap.set(id, input.newId());
  return { kind: "copy", sourceResourceId: record.sourceResourceId, idMap };
}

function annotationId(mark: Mark): string | null {
  const id: unknown = mark.attrs.id;
  return mark.type.name === "annotation" && typeof id === "string" ? id : null;
}

function collectIds(fragment: Fragment | PMNode, into: Set<string>): void {
  const visit = (node: PMNode): void => {
    for (const mark of node.marks) {
      const id = annotationId(mark);
      if (id !== null) into.add(id);
    }
  };
  if (fragment instanceof Fragment) {
    fragment.descendants((node) => {
      visit(node);
    });
  } else {
    visit(fragment);
  }
}

/** `remap` returns the mark to use, or null to drop an annotation mark. */
function mapMarks(
  fragment: Fragment,
  remap: (mark: Mark) => Mark | null,
): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      const marks = node.marks.flatMap((m) => {
        if (annotationId(m) === null) return [m];
        const next = remap(m);
        return next === null ? [] : [next];
      });
      nodes.push(node.mark(marks));
    } else {
      nodes.push(node.copy(mapMarks(node.content, remap)));
    }
  });
  return Fragment.fromArray(nodes);
}

function mapSlice(slice: Slice, remap: (mark: Mark) => Mark | null): Slice {
  return new Slice(
    mapMarks(slice.content, remap),
    slice.openStart,
    slice.openEnd,
  );
}

function removeMarksById(view: EditorView, ids: ReadonlySet<string>): void {
  if (view.isDestroyed || ids.size === 0) return;
  const { tr, doc } = view.state;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      const id = annotationId(mark);
      if (id !== null && ids.has(id)) {
        tr.removeMark(pos, pos + node.nodeSize, mark);
      }
    }
  });
  if (!tr.docChanged) return;
  view.dispatch(tr.setMeta(ANNOTATION_TRANSACTION_META, true));
}

interface PendingCopy {
  sourceResourceId: string;
  targetResourceId: string;
  projectId: string;
  idMap: ReadonlyMap<string, string>;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function writeCopies(
  view: EditorView,
  pending: PendingCopy,
  present: ReadonlySet<string>,
  options: AnnotationPasteOptions,
): Promise<AnnotationPasteResult> {
  const { projectId, sourceResourceId, targetResourceId } = pending;
  const failed = new Set<string>();
  let message: string | null = null;
  const fail = (id: string, text: string): void => {
    failed.add(id);
    message ??= text;
  };

  let sourceList: Annotation[] | null = null;
  try {
    sourceList = await options.api.list(projectId, sourceResourceId);
  } catch (error) {
    message = messageOf(error, "The notes could not be read for copying.");
  }
  for (const [oldId, newId] of pending.idMap) {
    if (!present.has(newId)) continue;
    const source = sourceList?.find((a) => a.id === oldId);
    if (!source) {
      fail(newId, message ?? "The note being copied no longer exists.");
      continue;
    }
    try {
      await options.api.add(projectId, targetResourceId, {
        id: newId,
        body: source.body,
        quote: source.quote,
      });
    } catch (error) {
      fail(newId, messageOf(error, "The note could not be copied."));
    }
  }
  removeMarksById(view, failed);
  return message === null ? { ok: true } : { ok: false, message };
}

const ANNOTATION_PASTE_KEY = new PluginKey("annotationPaste");

const AnnotationPaste = Extension.create<AnnotationPasteOptions>({
  name: "annotationPaste",

  addOptions() {
    return {
      getResourceId: () => null,
      getProjectId: () => null,
      api: { list: listAnnotations, add: addAnnotation },
      onResult: () => undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    // Set by the paste transform, consumed when the pasted marks reach the
    // document. A later paste replaces it.
    let pending: PendingCopy | null = null;

    return [
      new Plugin({
        key: ANNOTATION_PASTE_KEY,
        props: {
          transformPasted(slice, view) {
            pending = null;
            const pasted = new Set<string>();
            collectIds(slice.content, pasted);
            const inDocument = new Set<string>();
            collectIds(view.state.doc.content, inDocument);
            const targetResourceId = options.getResourceId();
            const plan = planAnnotationPaste({
              pastedIds: [...pasted],
              record: getLastClipboardOperation(),
              targetResourceId,
              idsInDocument: inDocument,
              newId: generateUUID,
            });
            if (plan.kind === "none" || plan.kind === "keep") return slice;
            if (plan.kind === "drop") return mapSlice(slice, () => null);
            const projectId = options.getProjectId();
            if (projectId === null || targetResourceId === null) {
              return mapSlice(slice, () => null);
            }
            pending = {
              sourceResourceId: plan.sourceResourceId,
              targetResourceId,
              projectId,
              idMap: plan.idMap,
            };
            return mapSlice(slice, (mark) => {
              const fresh = plan.idMap.get(mark.attrs.id as string);
              return fresh === undefined
                ? null
                : mark.type.create({ ...mark.attrs, id: fresh });
            });
          },
        },
        view() {
          return {
            update(view) {
              const current = pending;
              if (current === null) return;
              const inDocument = new Set<string>();
              collectIds(view.state.doc.content, inDocument);
              const fresh = new Set(current.idMap.values());
              const present = new Set(
                [...inDocument].filter((id) => fresh.has(id)),
              );
              if (present.size === 0) return;
              pending = null;
              void writeCopies(view, current, present, options).then(
                options.onResult,
              );
            },
          };
        },
      }),
    ];
  },
});

export default AnnotationPaste;
