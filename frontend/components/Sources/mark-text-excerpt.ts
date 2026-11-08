import type { Editor } from "@tiptap/core";
import { addAnnotation, deleteAnnotation } from "../../src/lib/api/annotations";
import {
  addTextExcerptFlow,
  type AnnotationFlowApi,
} from "../../src/lib/annotation-flows";
import type { Annotation, AnnotationLocator } from "../../src/lib/models/types";

const API: AnnotationFlowApi = { add: addAnnotation, remove: deleteAnnotation };

export interface MarkTextExcerptInput {
  editor: Editor;
  projectId: string;
  /** The open Source: its id is the annotation's resource and `target.sourceId`. */
  source: { id: string; name: string };
  locator?: AnnotationLocator;
}

export interface MarkTextExcerptOutcome {
  /** True only when the note was stored and its mark was added. */
  isOk: boolean;
  /** The stored annotation, also set when only the mark failed (listed as detached). */
  annotation: Annotation | null;
  /** Visible text for the writer, success or failure. */
  message: string;
}

/**
 * The one write path of a text excerpt (Feature 103, FR-21): the current editor
 * selection becomes an annotation in the Source body whose `target` is the
 * Source itself, through `addTextExcerptFlow`. Shared by the editor's "Mark as
 * excerpt" control; the failure stages are the flow's (a failed write stores
 * nothing and adds no mark; a failed mark after a stored write leaves the
 * excerpt stored, listed without a highlight).
 */
export async function markTextExcerpt(
  input: MarkTextExcerptInput,
): Promise<MarkTextExcerptOutcome> {
  const { editor, projectId, source, locator } = input;
  const { from, to } = editor.state.selection;
  const result = await addTextExcerptFlow(API, {
    editor,
    projectId,
    resourceId: source.id,
    range: { from, to },
    body: "",
    sourceName: source.name,
    ...(locator ? { locator } : {}),
  });
  if (result.ok) {
    return {
      isOk: true,
      annotation: result.annotation,
      message: "Marked the excerpt.",
    };
  }
  if (result.stage === "mark") {
    return {
      isOk: false,
      annotation: result.annotation,
      message: `${result.message} The excerpt is listed without a highlight in the text.`,
    };
  }
  return { isOk: false, annotation: null, message: result.message };
}
