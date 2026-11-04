/**
 * @module annotation-flows
 *
 * Explicit (non-optimistic) write flows for annotations (Feature 101, FR-12,
 * FR-14, FR-15). Each flow changes the sidecar through the transport and the
 * mark through the editor instance, in a fixed order, and reports which stage
 * failed:
 *
 * - add: sidecar first, mark only after that write succeeded. A failed write
 *   applies no mark. If the mark cannot then be applied, the stored body is a
 *   detached annotation (FR-17, FR-18).
 * - remove: body first, then the mark. If the mark step fails, the leftover is
 *   a mark with no body, which is inert.
 *
 * The mark transaction changes no text. It carries
 * `ANNOTATION_TRANSACTION_META` so a consumer can tell it from a text edit.
 * No flow touches revisions. No body, quote or error text is logged.
 */
import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import type { Annotation } from "./models/types";
import type { NewAnnotation } from "./api/annotations";

/** Transaction meta key set on every annotation mark change. */
export const ANNOTATION_TRANSACTION_META = "annotation";

/** The two transport calls the flows need. */
export interface AnnotationFlowApi {
  add(
    projectId: string,
    resourceId: string,
    annotation: NewAnnotation,
  ): Promise<Annotation>;
  remove(
    projectId: string,
    resourceId: string,
    annotationId: string,
  ): Promise<void>;
}

export interface AnnotationRange {
  from: number;
  to: number;
}

export interface AddAnnotationInput {
  editor: Editor;
  projectId: string;
  resourceId: string;
  body: string;
  /** The selection captured when the writer chose to add. */
  range: AnnotationRange;
  /** Defaults to a fresh UUID. */
  id?: string;
}

export type AddAnnotationResult =
  | { ok: true; annotation: Annotation }
  | { ok: false; stage: "empty-selection"; message: string }
  | { ok: false; stage: "write"; message: string }
  | {
      ok: false;
      stage: "mark";
      message: string;
      /** The stored annotation, now detached. */
      annotation: Annotation;
    };

export interface RemoveAnnotationInput {
  editor: Editor | null;
  projectId: string;
  resourceId: string;
  annotationId: string;
}

export type RemoveAnnotationResult =
  | { ok: true }
  | { ok: false; stage: "body"; message: string }
  | { ok: false; stage: "mark"; message: string };

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function quoteAt(editor: Editor, range: AnnotationRange): string {
  return editor.state.doc.textBetween(range.from, range.to, "\n");
}

function applyMark(
  editor: Editor,
  range: AnnotationRange,
  id: string,
  quote: string,
): void {
  const markType = editor.state.schema.marks.annotation;
  if (!markType) throw new Error("The editor has no annotation mark.");
  if (
    range.to > editor.state.doc.content.size ||
    quoteAt(editor, range) !== quote
  ) {
    throw new Error("The passage changed before the note could be attached.");
  }
  const tr = editor.state.tr
    .addMark(range.from, range.to, markType.create({ id }))
    .setMeta(ANNOTATION_TRANSACTION_META, true);
  editor.view.dispatch(tr);
}

/** Adds an annotation: sidecar write first, mark only after it succeeds. */
export async function addAnnotationFlow(
  api: AnnotationFlowApi,
  input: AddAnnotationInput,
): Promise<AddAnnotationResult> {
  const { editor, projectId, resourceId, body, range } = input;
  const quote = quoteAt(editor, range);
  if (range.to <= range.from || quote.length === 0) {
    return {
      ok: false,
      stage: "empty-selection",
      message: "Select some text to add a note.",
    };
  }
  const id = input.id ?? crypto.randomUUID();
  let annotation: Annotation;
  try {
    annotation = await api.add(projectId, resourceId, { id, body, quote });
  } catch (error) {
    return {
      ok: false,
      stage: "write",
      message: messageOf(error, "The note could not be saved."),
    };
  }
  try {
    applyMark(editor, range, id, quote);
  } catch (error) {
    return {
      ok: false,
      stage: "mark",
      message: messageOf(
        error,
        "The note was saved but could not be attached.",
      ),
      annotation,
    };
  }
  return { ok: true, annotation };
}

function removeMark(editor: Editor, annotationId: string): void {
  const { doc, tr } = editor.state;
  const targets: { from: number; to: number; mark: Mark }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name === "annotation" && mark.attrs.id === annotationId) {
        targets.push({ from: pos, to: pos + node.nodeSize, mark });
      }
    }
  });
  if (targets.length === 0) return;
  for (const t of targets) tr.removeMark(t.from, t.to, t.mark);
  tr.setMeta(ANNOTATION_TRANSACTION_META, true);
  editor.view.dispatch(tr);
}

/** Removes an annotation: body first, then the mark. */
export async function removeAnnotationFlow(
  api: AnnotationFlowApi,
  input: RemoveAnnotationInput,
): Promise<RemoveAnnotationResult> {
  const { editor, projectId, resourceId, annotationId } = input;
  try {
    await api.remove(projectId, resourceId, annotationId);
  } catch (error) {
    return {
      ok: false,
      stage: "body",
      message: messageOf(error, "The note could not be deleted."),
    };
  }
  if (!editor) return { ok: true };
  try {
    removeMark(editor, annotationId);
  } catch (error) {
    return {
      ok: false,
      stage: "mark",
      message: messageOf(
        error,
        "The note was deleted but its highlight could not be removed.",
      ),
    };
  }
  return { ok: true };
}
