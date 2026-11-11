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
 * - reattach: new quote written first, then the mark with the SAME id is
 *   applied to the selection. A failed write applies no mark; if only the mark
 *   step fails the annotation stays detached with its new quote.
 * - remove: body first, then the mark. If the mark step fails, the leftover is
 *   a mark with no body, which is inert.
 *
 * The mark transaction changes no text. It carries
 * `ANNOTATION_TRANSACTION_META` so a consumer can tell it from a text edit.
 * No flow touches revisions. No body, quote or error text is logged.
 */
import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import type {
  Annotation,
  AnnotationLocator,
  AnnotationTarget,
} from "./models/types";
import type { NewAnnotation } from "./api/annotations";
import { generateUUID } from "./models/uuid";
import {
  buildAttachmentExcerptInput,
  buildTextExcerptInput,
} from "./models/excerpts";

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

/** The one transport call the re-attach flow needs. */
export interface AnnotationReattachApi {
  reattach(
    projectId: string,
    resourceId: string,
    annotationId: string,
    quote: string,
  ): Promise<Annotation>;
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
  /** Feature 103: the Source this annotation cites or excerpts. */
  target?: AnnotationTarget;
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

export interface ReattachAnnotationInput {
  editor: Editor;
  projectId: string;
  resourceId: string;
  annotationId: string;
  /** The selection captured when the writer chose Re-attach. */
  range: AnnotationRange;
}

export type ReattachAnnotationResult =
  | { ok: true; annotation: Annotation }
  | { ok: false; stage: "empty-selection"; message: string }
  | { ok: false; stage: "write"; message: string }
  | { ok: false; stage: "mark"; message: string; annotation: Annotation };

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
  const { editor, projectId, resourceId, body, range, target } = input;
  const quote = quoteAt(editor, range);
  if (range.to <= range.from || quote.length === 0) {
    return {
      ok: false,
      stage: "empty-selection",
      message: "Select some text to add a note.",
    };
  }
  const id = input.id ?? generateUUID();
  let annotation: Annotation;
  try {
    annotation = await api.add(projectId, resourceId, {
      id,
      body,
      quote,
      ...(target === undefined ? {} : { target }),
    });
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

/** Re-attaches a detached annotation: new quote first, then the same-id mark. */
export async function reattachAnnotationFlow(
  api: AnnotationReattachApi,
  input: ReattachAnnotationInput,
): Promise<ReattachAnnotationResult> {
  const { editor, projectId, resourceId, annotationId, range } = input;
  const quote = quoteAt(editor, range);
  if (range.to <= range.from || quote.length === 0) {
    return {
      ok: false,
      stage: "empty-selection",
      message: "Select some text to re-attach the note.",
    };
  }
  let annotation: Annotation;
  try {
    annotation = await api.reattach(projectId, resourceId, annotationId, quote);
  } catch (error) {
    return {
      ok: false,
      stage: "write",
      message: messageOf(error, "The note could not be re-attached."),
    };
  }
  try {
    applyMark(editor, range, annotationId, quote);
  } catch (error) {
    return {
      ok: false,
      stage: "mark",
      message: messageOf(
        error,
        "The note was updated but could not be attached.",
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

export interface AddTextExcerptInput {
  editor: Editor;
  projectId: string;
  /** The Source's resource id; also the `target.sourceId`. */
  resourceId: string;
  range: AnnotationRange;
  body: string;
  sourceName?: string;
  locator?: AnnotationLocator;
  id?: string;
}

export type AddTextExcerptResult =
  | AddAnnotationResult
  | { ok: false; stage: "invalid"; message: string };

/**
 * Adds a text excerpt of a Source (FR-21): an annotation in the Source body
 * whose target is the Source itself. The target is validated before any write;
 * the write order and failure stages are those of {@link addAnnotationFlow}.
 */
export async function addTextExcerptFlow(
  api: AnnotationFlowApi,
  input: AddTextExcerptInput,
): Promise<AddTextExcerptResult> {
  const { editor, range } = input;
  const id = input.id ?? generateUUID();
  const built = buildTextExcerptInput({
    id,
    body: input.body,
    quote: quoteAt(editor, range),
    sourceId: input.resourceId,
    sourceName: input.sourceName,
    locator: input.locator,
  });
  if (!built.ok) {
    // An empty selection keeps its flow-level stage and message.
    if (range.to <= range.from || quoteAt(editor, range).length === 0) {
      return addAnnotationFlow(api, { ...input, id });
    }
    return { ok: false, stage: "invalid", message: built.message };
  }
  return addAnnotationFlow(api, {
    editor,
    projectId: input.projectId,
    resourceId: input.resourceId,
    body: built.value.body,
    range,
    id,
    target: built.value.target,
  });
}

export interface AddAttachmentExcerptInput {
  projectId: string;
  sourceId: string;
  attachmentId: string;
  locator: AnnotationLocator;
  sourceName?: string;
  id?: string;
}

export type AddAttachmentExcerptResult =
  | { ok: true; annotation: Annotation }
  | { ok: false; stage: "invalid" | "write"; message: string };

/**
 * Records a locator-only excerpt of an image or audio attachment (FR-22,
 * OQ-1): one annotation on the Source with an empty body and no mark by
 * design. There is no editor step, so the only stages are invalid and write.
 */
export async function addAttachmentExcerptFlow(
  api: Pick<AnnotationFlowApi, "add">,
  input: AddAttachmentExcerptInput,
): Promise<AddAttachmentExcerptResult> {
  const built = buildAttachmentExcerptInput({
    id: input.id ?? generateUUID(),
    sourceId: input.sourceId,
    attachmentId: input.attachmentId,
    locator: input.locator,
    sourceName: input.sourceName,
  });
  if (!built.ok) {
    return { ok: false, stage: "invalid", message: built.message };
  }
  try {
    const annotation = await api.add(
      input.projectId,
      input.sourceId,
      built.value as NewAnnotation,
    );
    return { ok: true, annotation };
  } catch (error) {
    return {
      ok: false,
      stage: "write",
      message: messageOf(error, "The excerpt could not be saved."),
    };
  }
}
