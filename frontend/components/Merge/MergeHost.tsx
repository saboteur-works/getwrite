"use client";

import React from "react";
import isEqual from "lodash/isEqual";
import { useStore } from "react-redux";
import type { Editor } from "@tiptap/core";
import MergeDialog, { type MergeDialogRefusal } from "./MergeDialog";
import { setMergeOpener, type MergeOpenOutcome } from "./mergeOpenRequest";
import { SplitUnlockPrompt } from "../Split/SplitHost";
import {
  parseStoredDocument,
  readStoredCanonicalText,
  showStoredDocumentInEditor,
} from "../Split/splitStoredDocument";
import {
  getActiveEditor,
  getActiveEditorResourceId,
} from "../Editor/activeEditorRegistry";
import { useOptionalTrashRefresh } from "../Layout/TrashRefreshContext";
import { openProject } from "../../src/lib/api/projects";
import {
  requestMerge,
  requestMergePreview,
  type MergeClientResult,
  type MergePreviewData,
} from "../../src/lib/api/merge";
import { hashSplitContent } from "../../src/lib/models/split-content-hash";
import { flushPendingSaves } from "../../src/lib/pending-saves";
import { isLockedAccessError } from "../../src/lib/models/crypto/locked-errors";
import { MERGE_REFUSAL_MESSAGES } from "../../src/lib/models/merge-messages";
import type { MergePreviewDocumentRef } from "../../src/lib/models/merge-preview-core";
import {
  MERGE_REFUSAL_REASONS,
  type MergeCarryOverChoice,
} from "../../src/lib/models/merge-types";
import type { TipTapDocument } from "../../src/lib/models";
import { tiptapToPlainText } from "../../src/lib/tiptap-text";
import { toastService } from "../../src/lib/toast-service";
import { countWords } from "../../src/lib/word-count";
import { useAppDispatch } from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import {
  loadResources,
  setFolders,
  updateResource,
} from "../../src/store/resourcesSlice";
import { loadRevisionsForSelectedResource } from "../../src/store/revisionsSlice";
import type { RootState } from "../../src/store/store";

/*
 * Host texts. Task 16's constants (`merge-messages.ts`) cover refusals, merge
 * failures and the index failure; these cover only what the host itself says
 * when it cannot start, cannot read back, or finishes. Drafted here for the
 * owner's wording review (Task 37).
 */
export const MERGE_SAVE_FAILED_MESSAGE =
  "Your latest edits could not be saved, so the documents were not merged. Nothing was changed.";
export const MERGE_READ_FAILED_MESSAGE =
  "A saved document could not be read, so the documents were not merged. Nothing was changed.";
export const MERGE_UNEXPECTED_FAILURE_MESSAGE =
  "The merge could not be started. Nothing was changed.";
export const MERGE_RELOAD_FAILED_MESSAGE =
  "The merge was saved, but the open document could not be read back into the editor. The editor is read-only until you open another document and come back, so the text from before the merge cannot be saved over the result.";
export const MERGE_TREE_REFRESH_FAILED_MESSAGE =
  "The documents were merged, but the project tree could not be refreshed. Reopen the project to see the current documents.";
/** The success toast's title. */
export const MERGE_SUCCESS_TITLE = "Documents merged";

/** The success toast's body; the name comes from the preview the writer saw. */
export function describeMergeSuccess(
  targetName: string,
  absorbedCount: number,
): string {
  const others =
    absorbedCount === 1
      ? "1 other document"
      : `${absorbedCount} other documents`;
  return `The text of ${others} was added to the end of “${targetName}”.`;
}

export interface MergeHostProps {
  /**
   * Unlocks the workspace with a passphrase; rejects on failure. Defaults to
   * the crypto slice's `unlockWorkspace` thunk. Tests pass a fake.
   */
  unlock?: (passphrase: string) => Promise<void>;
}

/** What the dialog shows now. */
interface DialogState {
  preview: MergePreviewData | null;
  refusal?: MergeDialogRefusal;
  failure?: string;
  isSubmitting: boolean;
}

/** The selection the preview was made for, and the open editor's text at that time. */
interface HeldMerge {
  projectDirectoryId: string;
  documents: MergePreviewDocumentRef[];
  preview: MergePreviewData;
  /** The editor showing one of the selected documents, if there is one. */
  editor: Editor | null;
  /** The id of that document. */
  openResourceId: string | null;
  /** The editor's document when the preview was requested. */
  snapshot: unknown;
}

/** A locked project's retry: `null` when the writer declined the unlock prompt. */
type UnlockedResult<T> = { value: T } | null;

const STALE: MergeDialogRefusal = {
  reason: MERGE_REFUSAL_REASONS.staleContent,
};

/**
 * Hosts "Merge documents" (Feature 121, FR-7 client half): sends pending saves,
 * reads each selected document's stored canonical revision, asks the server
 * for the preview, shows the dialog, applies the merge and then shows the
 * stored state of the document the editor shows.
 *
 * The only way in is `openMergeDialog()` (`mergeOpenRequest.ts`); this host
 * binds no key and adds no menu item or palette row. It is not mounted on the
 * Android runtime (the routes do not exist there).
 *
 * While a merge is under way, an editor that shows one of the selected
 * documents is held read-only, so no text can be typed that an autosave would
 * send after the merge. Pending saves are sent before the preview and again
 * before the apply; a save that failed stops the merge. After the merge the
 * editor shows the stored text of the document it shows (an absorbed document
 * has its note marks removed, the target has the appended text) outside the
 * undo stack, which the editor reports as structural-only, so it is never
 * autosaved. The host never selects or opens another document.
 */
export default function MergeHost({ unlock }: MergeHostProps): JSX.Element {
  const store = useStore<RootState>();
  const dispatch = useAppDispatch();
  const trashRefresh = useOptionalTrashRefresh();
  const notifyProjectChanged = trashRefresh?.notifyTrashRestored;
  const [dialog, setDialog] = React.useState<DialogState | null>(null);
  const [hasOpened, setHasOpened] = React.useState<boolean>(false);
  const [isUnlockOpen, setIsUnlockOpen] = React.useState<boolean>(false);
  const isBusy = React.useRef<boolean>(false);
  const isSubmitting = React.useRef<boolean>(false);
  const held = React.useRef<HeldMerge | null>(null);
  /** The editor held read-only, kept so it is released on the paths that allow it. */
  const heldEditor = React.useRef<Editor | null>(null);
  /** Set when the stored text could not be read back: the editor then stays read-only. */
  const isHeldForGood = React.useRef<boolean>(false);
  const unlockAnswer = React.useRef<((isUnlocked: boolean) => void) | null>(
    null,
  );

  function release(): void {
    const editor = heldEditor.current;
    heldEditor.current = null;
    held.current = null;
    isBusy.current = false;
    if (editor && !editor.isDestroyed && !isHeldForGood.current) {
      editor.setEditable(true, false);
    }
    isHeldForGood.current = false;
  }

  function showDialog(next: Omit<DialogState, "isSubmitting">): void {
    setHasOpened(true);
    setDialog({ ...next, isSubmitting: false });
  }

  function endWithToast(message: string): void {
    toastService.error(message);
    release();
  }

  function askUnlock(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      unlockAnswer.current = resolve;
      setIsUnlockOpen(true);
    });
  }

  function answerUnlock(isUnlocked: boolean): void {
    setIsUnlockOpen(false);
    const resolve = unlockAnswer.current;
    unlockAnswer.current = null;
    resolve?.(isUnlocked);
  }

  /** Runs a request; a locked project opens the unlock prompt and retries once. */
  async function withUnlock<T>(
    run: () => Promise<T>,
  ): Promise<UnlockedResult<T>> {
    try {
      return { value: await run() };
    } catch (error: unknown) {
      if (!isLockedAccessError(error)) throw error;
    }
    if (!(await askUnlock())) return null;
    return { value: await run() };
  }

  /** Reads every selected document in order; `"unreadable"` when one cannot be read. */
  async function readDocuments(
    projectDirectoryId: string,
    ids: readonly string[],
  ): Promise<
    | { kind: "read"; documents: MergePreviewDocumentRef[]; texts: string[] }
    | { kind: "unreadable" }
    | { kind: "locked" }
  > {
    const documents: MergePreviewDocumentRef[] = [];
    const texts: string[] = [];
    for (const resourceId of ids) {
      const read = await withUnlock(() =>
        readStoredCanonicalText(projectDirectoryId, resourceId),
      );
      if (read === null) return { kind: "locked" };
      if (!read.value || !parseStoredDocument(read.value.content)) {
        return { kind: "unreadable" };
      }
      documents.push({
        resourceId,
        revisionId: read.value.revisionId,
        contentHash: hashSplitContent(read.value.content),
      });
      texts.push(read.value.content);
    }
    return { kind: "read", documents, texts };
  }

  function showPreviewResult(
    result: Awaited<ReturnType<typeof requestMergePreview>>,
    around: Omit<HeldMerge, "preview">,
  ): void {
    if (result.kind === "preview") {
      held.current = { ...around, preview: result.preview };
      showDialog({ preview: result.preview });
    } else if (result.kind === "stale") {
      showDialog({ preview: null, refusal: STALE });
    } else if (result.kind === "refused") {
      showDialog({ preview: null, refusal: { reason: result.reason } });
    } else {
      showDialog({ preview: null, failure: result.message });
    }
  }

  async function begin(
    ids: readonly string[],
    projectDirectoryId: string,
    editor: Editor | null,
    openResourceId: string | null,
  ): Promise<void> {
    if (!(await flushPendingSaves())) {
      endWithToast(MERGE_SAVE_FAILED_MESSAGE);
      return;
    }
    const read = await readDocuments(projectDirectoryId, ids);
    if (read.kind === "locked") {
      endWithToast(MERGE_REFUSAL_MESSAGES[MERGE_REFUSAL_REASONS.lockedProject]);
      return;
    }
    if (read.kind === "unreadable") {
      endWithToast(MERGE_READ_FAILED_MESSAGE);
      return;
    }
    if (editor && openResourceId) {
      const shown = editor.getJSON() as TipTapDocument;
      const storedOpen = parseStoredDocument(
        read.texts[ids.indexOf(openResourceId)],
      );
      if (
        !storedOpen ||
        tiptapToPlainText(shown) !== tiptapToPlainText(storedOpen)
      ) {
        showDialog({ preview: null, refusal: STALE });
        return;
      }
    }
    const answered = await withUnlock(() =>
      requestMergePreview(projectDirectoryId, { documents: read.documents }),
    );
    if (answered === null) {
      endWithToast(MERGE_REFUSAL_MESSAGES[MERGE_REFUSAL_REASONS.lockedProject]);
      return;
    }
    showPreviewResult(answered.value, {
      projectDirectoryId,
      documents: read.documents,
      editor,
      openResourceId,
      snapshot: editor ? editor.getJSON() : null,
    });
  }

  function open(ids: readonly string[]): MergeOpenOutcome {
    if (ids.length < 2) return "too-few-documents";
    if (isBusy.current) return "busy";
    const projectDirectoryId = selectActiveProjectDirectoryId(store.getState());
    if (!projectDirectoryId) return "no-project";
    isBusy.current = true;
    isHeldForGood.current = false;
    // Only an editor showing one of the selected documents is held.
    const editor = getActiveEditor();
    const shownId = getActiveEditorResourceId();
    const isInSelection =
      editor !== null &&
      !editor.isDestroyed &&
      shownId !== null &&
      ids.includes(shownId);
    const heldOne = isInSelection ? editor : null;
    if (heldOne) {
      heldEditor.current = heldOne;
      heldOne.setEditable(false, false);
    }
    begin(
      [...ids],
      projectDirectoryId,
      heldOne,
      heldOne ? shownId : null,
    ).catch((error: unknown) => {
      console.error("Merge could not be started", error);
      endWithToast(MERGE_UNEXPECTED_FAILURE_MESSAGE);
    });
    return "started";
  }

  const openRef = React.useRef(open);
  openRef.current = open;
  React.useEffect(() => {
    setMergeOpener((ids) => openRef.current(ids));
    return () => setMergeOpener(null);
  }, []);

  async function refreshTree(projectDirectoryId: string): Promise<void> {
    if (selectActiveProjectDirectoryId(store.getState()) !== projectDirectoryId)
      return;
    try {
      const opened = await openProject(projectDirectoryId);
      if (!Array.isArray(opened.resources) || !Array.isArray(opened.folders)) {
        throw new Error("The project read returned no resources or folders.");
      }
      dispatch(
        loadResources({
          resources: opened.resources,
          projectId: projectDirectoryId,
        }),
      );
      dispatch(setFolders(opened.folders));
      notifyProjectChanged?.();
    } catch (error: unknown) {
      console.error("Error refreshing project after merge:", error);
      toastService.error(MERGE_TREE_REFRESH_FAILED_MESSAGE);
    }
  }

  /** Shows the stored text of the open document; false when it could not be read back. */
  async function reloadOpenDocument(around: HeldMerge): Promise<boolean> {
    const { editor, openResourceId } = around;
    if (!editor || !openResourceId) return true;
    const after = await readStoredCanonicalText(
      around.projectDirectoryId,
      openResourceId,
    );
    const stored = after ? parseStoredDocument(after.content) : null;
    if (!stored || editor.isDestroyed) return false;
    showStoredDocumentInEditor(editor, stored);
    dispatch(
      updateResource({
        id: openResourceId,
        wordCount: countWords(tiptapToPlainText(stored)),
      }),
    );
    return true;
  }

  /** After a saved merge: notices, the tree, the revision list and the stored text in the editor. */
  async function finishApplied(
    result: Extract<MergeClientResult, { kind: "applied" | "index-failed" }>,
    around: HeldMerge,
  ): Promise<void> {
    for (const notice of result.notices) toastService.info(notice);
    if (result.kind === "index-failed") toastService.error(result.message);
    void refreshTree(around.projectDirectoryId);
    if (around.openResourceId) {
      void dispatch(
        loadRevisionsForSelectedResource({ resourceId: around.openResourceId }),
      );
    }
    let isReloaded: boolean;
    try {
      isReloaded = await reloadOpenDocument(around);
    } catch (error: unknown) {
      if (!isLockedAccessError(error)) throw error;
      isReloaded = false;
    }
    if (!isReloaded) {
      isHeldForGood.current = true;
      setDialog({
        preview: null,
        failure: MERGE_RELOAD_FAILED_MESSAGE,
        isSubmitting: false,
      });
      return;
    }
    toastService.success(
      MERGE_SUCCESS_TITLE,
      describeMergeSuccess(
        around.preview.target.name,
        around.preview.absorbed.length,
      ),
    );
    setDialog(null);
    release();
  }

  function stopSubmit(next: Partial<DialogState>): void {
    setDialog((current) =>
      current
        ? { ...current, ...next, isSubmitting: false }
        : { preview: null, ...next, isSubmitting: false },
    );
  }

  async function apply(choice: MergeCarryOverChoice): Promise<void> {
    const around = held.current;
    if (!around) return;
    if (!(await flushPendingSaves())) {
      stopSubmit({ failure: MERGE_SAVE_FAILED_MESSAGE });
      return;
    }
    const isSameEditor =
      around.editor === null ||
      (!around.editor.isDestroyed &&
        getActiveEditorResourceId() === around.openResourceId &&
        isEqual(around.editor.getJSON(), around.snapshot));
    if (!isSameEditor) {
      stopSubmit({ refusal: STALE });
      return;
    }
    const answered = await withUnlock(() =>
      requestMerge(around.projectDirectoryId, {
        documents: around.documents,
        carryOver: choice,
      }),
    );
    if (answered === null) {
      stopSubmit({
        failure: MERGE_REFUSAL_MESSAGES[MERGE_REFUSAL_REASONS.lockedProject],
      });
      return;
    }
    const result = answered.value;
    if (result.kind === "applied" || result.kind === "index-failed") {
      await finishApplied(result, around);
    } else if (result.kind === "stale") {
      stopSubmit({ refusal: STALE });
    } else if (result.kind === "annotation-limit") {
      stopSubmit({
        refusal: {
          reason: MERGE_REFUSAL_REASONS.annotationLimit,
          ...(result.counts ? { annotationCounts: result.counts } : {}),
        },
      });
    } else if (result.kind === "refused") {
      stopSubmit({ refusal: { reason: result.reason } });
    } else {
      stopSubmit({ failure: result.message });
    }
  }

  function confirm(choice: MergeCarryOverChoice): void {
    if (isSubmitting.current || !held.current) return;
    isSubmitting.current = true;
    setDialog((current) =>
      current ? { ...current, failure: undefined, isSubmitting: true } : null,
    );
    apply(choice)
      .catch((error: unknown) => {
        console.error("Merge failed", error);
        stopSubmit({ failure: MERGE_UNEXPECTED_FAILURE_MESSAGE });
      })
      .finally(() => {
        isSubmitting.current = false;
      });
  }

  function close(): void {
    if (isSubmitting.current) return;
    setDialog(null);
    release();
  }

  return (
    <>
      {hasOpened ? (
        <MergeDialog
          isOpen={dialog !== null}
          preview={dialog?.preview ?? null}
          refusal={dialog?.refusal}
          failure={dialog?.failure}
          isSubmitting={dialog?.isSubmitting ?? false}
          onConfirm={confirm}
          onClose={close}
        />
      ) : null}
      {isUnlockOpen ? (
        <SplitUnlockPrompt
          unlock={unlock}
          onUnlocked={() => answerUnlock(true)}
          onDeclined={() => answerUnlock(false)}
        />
      ) : null}
    </>
  );
}
