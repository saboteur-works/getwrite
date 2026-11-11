/**
 * @module claim-flows
 *
 * Explicit (non-optimistic) write flows for claims (Feature 108, FR-14, FR-15).
 * A claim is an annotation with a `claim` marker, so the add flow follows the
 * order of `addAnnotationFlow`:
 *
 * - add: the claim is stored first, the `annotation` mark is set only after
 *   that write succeeded. A failed write sets no mark. If the mark cannot then
 *   be set, the stored claim is a detached claim and is reported as such.
 * - update (status, Source link, statement): one write through the injected
 *   transport. A failed write returns the error text and no annotation, so a
 *   caller keeps showing the stored value it already had.
 *
 * Transport functions are injected, so the flows know no route, native backend
 * or store. No flow reads or writes the project's own status list. No
 * statement, quote or error text is logged.
 */
import type { Editor } from "@tiptap/core";
import type { Annotation, AnnotationTarget } from "./models/types";
import {
  CLAIM_STATUSES,
  type ClaimStatus,
  type NewClaimInput,
  type UpdateClaimInput,
} from "./models/claim-types";
import { ANNOTATION_TRANSACTION_META } from "./annotation-flows";
import { generateUUID } from "./models/uuid";

/** The two transport calls the claim flows need. */
export interface ClaimFlowApi {
  add(
    projectId: string,
    resourceId: string,
    input: NewClaimInput,
  ): Promise<Annotation>;
  update(
    projectId: string,
    resourceId: string,
    annotationId: string,
    input: UpdateClaimInput,
  ): Promise<Annotation>;
}

export interface ClaimRange {
  from: number;
  to: number;
}

export interface AddClaimInput {
  editor: Editor;
  projectId: string;
  resourceId: string;
  statement: string;
  /** The selection captured when the writer chose Mark as claim. */
  range: ClaimRange;
  /** Defaults to a fresh UUID. */
  id?: string;
}

export type AddClaimResult =
  | { ok: true; annotation: Annotation }
  | { ok: false; stage: "empty-selection" | "invalid"; message: string }
  | { ok: false; stage: "write"; message: string }
  | {
      ok: false;
      stage: "mark";
      message: string;
      /** The stored claim, now detached. */
      annotation: Annotation;
    };

export type UpdateClaimResult =
  | { ok: true; annotation: Annotation }
  | { ok: false; stage: "invalid" | "write"; message: string };

interface UpdateBase {
  projectId: string;
  resourceId: string;
  annotationId: string;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function quoteAt(editor: Editor, range: ClaimRange): string {
  return editor.state.doc.textBetween(range.from, range.to, "\n");
}

function applyMark(
  editor: Editor,
  range: ClaimRange,
  id: string,
  quote: string,
): void {
  const markType = editor.state.schema.marks.annotation;
  if (!markType) throw new Error("The editor has no annotation mark.");
  if (
    range.to > editor.state.doc.content.size ||
    quoteAt(editor, range) !== quote
  ) {
    throw new Error("The passage changed before the claim could be attached.");
  }
  const tr = editor.state.tr
    .addMark(range.from, range.to, markType.create({ id }))
    .setMeta(ANNOTATION_TRANSACTION_META, true);
  editor.view.dispatch(tr);
}

/** Marks the selection as a claim: store first, mark only after it succeeds. */
export async function addClaimFlow(
  api: ClaimFlowApi,
  input: AddClaimInput,
): Promise<AddClaimResult> {
  const { editor, projectId, resourceId, statement, range } = input;
  const quote = quoteAt(editor, range);
  if (range.to <= range.from || quote.length === 0) {
    return {
      ok: false,
      stage: "empty-selection",
      message: "Select some text to mark as a claim.",
    };
  }
  if (statement.trim().length === 0) {
    return {
      ok: false,
      stage: "invalid",
      message: "Write the claim statement first.",
    };
  }
  const id = input.id ?? generateUUID();
  let annotation: Annotation;
  try {
    annotation = await api.add(projectId, resourceId, { id, statement, quote });
  } catch (error) {
    return {
      ok: false,
      stage: "write",
      message: messageOf(error, "The claim could not be saved."),
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
        "The claim was saved but could not be attached.",
      ),
      annotation,
    };
  }
  return { ok: true, annotation };
}

async function writeUpdate(
  api: ClaimFlowApi,
  base: UpdateBase,
  change: UpdateClaimInput,
  fallback: string,
): Promise<UpdateClaimResult> {
  try {
    const annotation = await api.update(
      base.projectId,
      base.resourceId,
      base.annotationId,
      change,
    );
    return { ok: true, annotation };
  } catch (error) {
    return { ok: false, stage: "write", message: messageOf(error, fallback) };
  }
}

/** Changes a claim's status; a status off the four is refused before any write. */
export async function updateClaimStatusFlow(
  api: ClaimFlowApi,
  input: UpdateBase & { status: ClaimStatus },
): Promise<UpdateClaimResult> {
  if (!(CLAIM_STATUSES as readonly string[]).includes(input.status)) {
    return {
      ok: false,
      stage: "invalid",
      message: "That status is not one of the claim statuses.",
    };
  }
  return writeUpdate(
    api,
    input,
    { status: input.status },
    "The status could not be changed.",
  );
}

/** Links a claim to a Source, or clears the link with a `null` target. */
export async function updateClaimTargetFlow(
  api: ClaimFlowApi,
  input: UpdateBase & { target: AnnotationTarget | null },
): Promise<UpdateClaimResult> {
  return writeUpdate(
    api,
    input,
    { target: input.target },
    "The Source link could not be changed.",
  );
}

/** Changes a claim's statement; a blank statement is refused before any write. */
export async function updateClaimStatementFlow(
  api: ClaimFlowApi,
  input: UpdateBase & { statement: string },
): Promise<UpdateClaimResult> {
  if (input.statement.trim().length === 0) {
    return {
      ok: false,
      stage: "invalid",
      message: "The claim statement cannot be empty.",
    };
  }
  return writeUpdate(
    api,
    input,
    { statement: input.statement },
    "The statement could not be changed.",
  );
}
