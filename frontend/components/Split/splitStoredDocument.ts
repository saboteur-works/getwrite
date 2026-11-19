/**
 * Reading the stored canonical text of a document and showing it in the open
 * editor (Feature 120, Task 32). These follow `SplitHost.tsx` (Task 25), whose
 * copies are not exported and which this task does not edit; the two can be
 * merged into one module in a later change.
 */
import type { Editor } from "@tiptap/core";
import type { Content } from "@tiptap/react";
import { normalizeStoredContent } from "../Editor/loadDocumentIntoEditor";
import {
  fetchSplitResourceContent,
  fetchSplitRevisionContent,
} from "../../src/lib/api/split-stored-read";
import type { TipTapDocument } from "../../src/lib/models";

/** The canonical revision of a document and its stored text. */
export interface StoredCanonical {
  revisionId: string;
  content: string;
}

/** Parses stored content as a TipTap document; `null` when it is not one. */
export function parseStoredDocument(content: string): TipTapDocument | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { type?: unknown }).type === "doc" &&
      Array.isArray((parsed as { content?: unknown }).content)
    ) {
      return parsed as TipTapDocument;
    }
    return null;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/**
 * Reads the canonical revision's stored text; `null` when it cannot be read.
 * A locked project throws the locked-access error; the caller decides how to
 * surface it.
 */
export async function readStoredCanonicalText(
  projectDirectoryId: string,
  resourceId: string,
): Promise<StoredCanonical | null> {
  const resource = await fetchSplitResourceContent(
    projectDirectoryId,
    resourceId,
  );
  const canonical = resource?.revisions?.find((r) => r.isCanonical);
  if (!canonical) return null;
  const content = await fetchSplitRevisionContent(
    resourceId,
    projectDirectoryId,
    canonical.id,
  );
  return content === null ? null : { revisionId: canonical.id, content };
}

/** The open editor shows the stored document, cursor at its end, outside the undo stack. */
export function showStoredDocumentInEditor(
  editor: Editor,
  doc: TipTapDocument,
): void {
  // `emitUpdate` is on so the edit view's own copy follows the editor; the
  // transaction is marked `addToHistory: false`, which the editor reports as
  // structural-only, so it is never autosaved.
  editor
    .chain()
    .setMeta("addToHistory", false)
    .setContent(normalizeStoredContent(doc as unknown as Content), {
      emitUpdate: true,
    })
    .run();
  editor.commands.setTextSelection(editor.state.doc.content.size);
  editor.commands.scrollIntoView();
}
