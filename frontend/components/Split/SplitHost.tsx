"use client";

import React from "react";
import isEqual from "lodash/isEqual";
import { useStore } from "react-redux";
import type { Editor } from "@tiptap/core";
import type { Content } from "@tiptap/react";
import SplitDialog from "./SplitDialog";
import { setSplitOpener, type SplitOpenOutcome } from "./splitOpenRequest";
import { plainTextOffsetAtPosition } from "./splitOffset";
import UnlockModal from "../common/UnlockModal";
import {
  getActiveEditor,
  getActiveEditorResourceId,
} from "../Editor/activeEditorRegistry";
import { normalizeStoredContent } from "../Editor/loadDocumentIntoEditor";
import { useOptionalTrashRefresh } from "../Layout/TrashRefreshContext";
import {
  useDeclareUnlockPromptMounted,
  useSharingLimits,
} from "../Sharing/SharingLimitsContext";
import { isUnlockPromptAllowed } from "../Sharing/unlock-prompt-gate";
import { openProject } from "../../src/lib/api/projects";
import {
  fetchSplitResourceContent,
  fetchSplitRevisionContent,
} from "../../src/lib/api/split-stored-read";
import {
  hashSplitContent,
  requestSplit,
  requestSplitPreview,
  type SplitClientResult,
  type SplitPreviewData,
} from "../../src/lib/api/split";
import { flushPendingSaves } from "../../src/lib/pending-saves";
import { isLockedAccessError } from "../../src/lib/models/crypto/locked-errors";
import {
  describeSplitSuccess,
  SPLIT_READ_FAILED_MESSAGE,
  SPLIT_REFUSAL_MESSAGES,
  SPLIT_RELOAD_FAILED_MESSAGE,
  SPLIT_SAVE_FAILED_MESSAGE,
  SPLIT_SUCCESS_TITLE,
  SPLIT_TREE_REFRESH_FAILED_MESSAGE,
  SPLIT_UNEXPECTED_FAILURE_MESSAGE,
} from "../../src/lib/models/split-messages";
import {
  SPLIT_REFUSAL_REASONS,
  type SplitCarryOverChoice,
  type SplitRefusalReason,
} from "../../src/lib/models/split-types";
import type { TipTapDocument } from "../../src/lib/models";
import { tiptapToPlainText } from "../../src/lib/tiptap-text";
import { toastService } from "../../src/lib/toast-service";
import { countWords } from "../../src/lib/word-count";
import { useAppDispatch, useAppSelector } from "../../src/store/hooks";
import { unlockWorkspace } from "../../src/store/cryptoSlice";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import {
  loadResources,
  setFolders,
  updateResource,
} from "../../src/store/resourcesSlice";
import { loadRevisionsForSelectedResource } from "../../src/store/revisionsSlice";
import type { RootState } from "../../src/store/store";

export interface SplitHostProps {
  /**
   * Unlocks the workspace with a passphrase; rejects on failure. Defaults to
   * the crypto slice's `unlockWorkspace` thunk. Tests pass a fake.
   */
  unlock?: (passphrase: string) => Promise<void>;
}

/** What the dialog shows now. */
interface DialogState {
  preview: SplitPreviewData | null;
  refusalReason?: SplitRefusalReason;
  failure?: string;
  isSubmitting: boolean;
}

/** The cursor the preview was made for, and the editor text it was made from. */
interface HeldSplit {
  editor: Editor;
  projectDirectoryId: string;
  resourceId: string;
  revisionId: string;
  contentHash: string;
  offset: number;
  /** The editor's document when the preview was requested. */
  snapshot: unknown;
}

interface StoredCanonical {
  revisionId: string;
  content: string;
}

/** A locked project's retry: `null` when the writer declined the unlock prompt. */
type UnlockedResult<T> = { value: T } | null;

function parseDocument(content: string): TipTapDocument | null {
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
 * A locked project throws the locked-access error (the caller offers the
 * unlock prompt).
 */
async function readStoredCanonical(
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
function showStoredDocument(editor: Editor, doc: TipTapDocument): void {
  // `emitUpdate` is on so the edit view's own copy of the document follows
  // the editor; the transaction is marked `addToHistory: false`, which the
  // editor reports as structural-only, so it is never autosaved.
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

interface UnlockPromptProps {
  unlock?: (passphrase: string) => Promise<void>;
  onUnlocked: () => void;
  onDeclined: () => void;
}

/**
 * The workspace unlock prompt, as the Capture box shows it: only when the
 * limits read allows it. Mounted only while a locked project needs it, so the
 * host itself needs no sharing-limits context.
 */
export function SplitUnlockPrompt({
  unlock,
  onUnlocked,
  onDeclined,
}: UnlockPromptProps): JSX.Element | null {
  const dispatch = useAppDispatch();
  const { hasDesktopBridge, refresh } = useSharingLimits();
  const encryptedProjectCount = useAppSelector(
    (s: RootState) => s.crypto?.encryptedProjectIds.length ?? 0,
  );
  const [isAllowed, setIsAllowed] = React.useState<boolean>(false);
  const [isBusy, setIsBusy] = React.useState<boolean>(false);
  const [errorMessage, setErrorMessage] = React.useState<string | undefined>();
  useDeclareUnlockPromptMounted(isAllowed);

  React.useEffect(() => {
    let isCurrent = true;
    void refresh().then((fresh) => {
      if (!isCurrent) return;
      if (isUnlockPromptAllowed(fresh, hasDesktopBridge)) setIsAllowed(true);
      else onDeclined();
    });
    return () => {
      isCurrent = false;
    };
    // The prompt decides once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(passphrase: string): Promise<void> {
    setIsBusy(true);
    const fresh = await refresh();
    if (!isUnlockPromptAllowed(fresh, hasDesktopBridge)) {
      setIsBusy(false);
      onDeclined();
      return;
    }
    try {
      if (unlock) await unlock(passphrase);
      else await dispatch(unlockWorkspace(passphrase)).unwrap();
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Could not unlock this workspace.",
      );
      setIsBusy(false);
      return;
    }
    setIsBusy(false);
    onUnlocked();
  }

  if (!isAllowed) return null;
  return (
    <UnlockModal
      isOpen
      encryptedProjectCount={Math.max(1, encryptedProjectCount)}
      isBusy={isBusy}
      errorMessage={errorMessage}
      onUnlock={(passphrase) => void submit(passphrase)}
      onDecline={onDeclined}
    />
  );
}

/**
 * Hosts "Split a document at the cursor" (Feature 120, FR-7, FR-12): sends
 * pending saves, asks the server for the preview of the open editor's cursor,
 * shows the dialog, applies the split and then shows the stored state of the
 * original with the cursor at its end. The original stays open.
 *
 * The only way in is `openSplitDialog()` (`splitOpenRequest.ts`); this host
 * binds no key and adds no menu item or palette row. It is not mounted on the
 * Android runtime (the routes do not exist there).
 *
 * While a split is under way the editor is held read-only, so no text can be
 * typed that an autosave would send after the split. Pending saves are sent
 * before the preview and again before the apply; a save that failed stops the
 * split. The text the editor holds is compared with the text it held at the
 * preview, so a pending autosave of text the server did not see cannot exist
 * when the apply is sent.
 */
export default function SplitHost({ unlock }: SplitHostProps): JSX.Element {
  const store = useStore<RootState>();
  const dispatch = useAppDispatch();
  const trashRefresh = useOptionalTrashRefresh();
  const notifyProjectChanged = trashRefresh?.notifyTrashRestored;
  const [dialog, setDialog] = React.useState<DialogState | null>(null);
  const [hasOpened, setHasOpened] = React.useState<boolean>(false);
  const [isUnlockOpen, setIsUnlockOpen] = React.useState<boolean>(false);
  const isBusy = React.useRef<boolean>(false);
  const isSubmitting = React.useRef<boolean>(false);
  const held = React.useRef<HeldSplit | null>(null);
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

  async function begin(
    editor: Editor,
    resourceId: string,
    projectDirectoryId: string,
  ): Promise<void> {
    if (!(await flushPendingSaves())) {
      endWithToast(SPLIT_SAVE_FAILED_MESSAGE);
      return;
    }
    const read = await withUnlock(() =>
      readStoredCanonical(projectDirectoryId, resourceId),
    );
    if (read === null) {
      endWithToast(SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.lockedProject]);
      return;
    }
    const stored = read.value;
    const storedDocument = stored ? parseDocument(stored.content) : null;
    if (!stored || !storedDocument) {
      endWithToast(SPLIT_READ_FAILED_MESSAGE);
      return;
    }
    const shown = editor.getJSON() as TipTapDocument;
    if (tiptapToPlainText(shown) !== tiptapToPlainText(storedDocument)) {
      showDialog({
        preview: null,
        refusalReason: SPLIT_REFUSAL_REASONS.staleCursor,
      });
      return;
    }
    const cursor = {
      resourceId,
      revisionId: stored.revisionId,
      contentHash: hashSplitContent(stored.content),
      offset: plainTextOffsetAtPosition(
        editor.state.doc,
        editor.state.selection.head,
      ),
    };
    held.current = {
      editor,
      projectDirectoryId,
      snapshot: editor.getJSON(),
      ...cursor,
    };
    const answered = await withUnlock(() =>
      requestSplitPreview(projectDirectoryId, cursor),
    );
    if (answered === null) {
      endWithToast(SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.lockedProject]);
      return;
    }
    const result = answered.value;
    if (result.kind === "preview") {
      showDialog({ preview: result.preview });
    } else if (result.kind === "stale") {
      showDialog({
        preview: null,
        refusalReason: SPLIT_REFUSAL_REASONS.staleCursor,
      });
    } else if (result.kind === "refused") {
      showDialog({ preview: null, refusalReason: result.reason });
    } else {
      showDialog({ preview: null, failure: result.message });
    }
  }

  function open(): SplitOpenOutcome {
    if (isBusy.current) return "busy";
    const editor = getActiveEditor();
    const resourceId = getActiveEditorResourceId();
    const projectDirectoryId = selectActiveProjectDirectoryId(store.getState());
    if (!editor || editor.isDestroyed || !resourceId || !projectDirectoryId) {
      return "no-document";
    }
    isBusy.current = true;
    isHeldForGood.current = false;
    heldEditor.current = editor;
    editor.setEditable(false, false);
    begin(editor, resourceId, projectDirectoryId).catch((error: unknown) => {
      console.error("Split could not be started", error);
      endWithToast(SPLIT_UNEXPECTED_FAILURE_MESSAGE);
    });
    return "started";
  }

  const openRef = React.useRef(open);
  openRef.current = open;
  React.useEffect(() => {
    setSplitOpener(() => openRef.current());
    return () => setSplitOpener(null);
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
      console.error("Error refreshing project after split:", error);
      toastService.error(SPLIT_TREE_REFRESH_FAILED_MESSAGE);
    }
  }

  /** After a saved split: notices, the stored text in the editor, the tree and the revision list. */
  async function finishApplied(
    result: Extract<SplitClientResult, { kind: "applied" | "index-failed" }>,
    around: HeldSplit,
    newName: string,
  ): Promise<void> {
    for (const notice of result.notices) toastService.info(notice);
    if (result.kind === "index-failed") toastService.error(result.message);
    void refreshTree(around.projectDirectoryId);
    void dispatch(
      loadRevisionsForSelectedResource({ resourceId: around.resourceId }),
    );
    const after = await readStoredCanonical(
      around.projectDirectoryId,
      around.resourceId,
    );
    const doc = after ? parseDocument(after.content) : null;
    if (!doc) {
      isHeldForGood.current = true;
      setDialog({
        preview: null,
        failure: SPLIT_RELOAD_FAILED_MESSAGE,
        isSubmitting: false,
      });
      return;
    }
    showStoredDocument(around.editor, doc);
    dispatch(
      updateResource({
        id: around.resourceId,
        wordCount: countWords(tiptapToPlainText(doc)),
      }),
    );
    toastService.success(SPLIT_SUCCESS_TITLE, describeSplitSuccess(newName));
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

  async function apply(choice: SplitCarryOverChoice): Promise<void> {
    const around = held.current;
    if (!around) return;
    if (!(await flushPendingSaves())) {
      stopSubmit({ failure: SPLIT_SAVE_FAILED_MESSAGE });
      return;
    }
    const isSameEditor =
      !around.editor.isDestroyed &&
      getActiveEditorResourceId() === around.resourceId &&
      isEqual(around.editor.getJSON(), around.snapshot);
    if (!isSameEditor) {
      stopSubmit({ refusalReason: SPLIT_REFUSAL_REASONS.staleCursor });
      return;
    }
    const answered = await withUnlock(() =>
      requestSplit(around.projectDirectoryId, {
        resourceId: around.resourceId,
        revisionId: around.revisionId,
        contentHash: around.contentHash,
        offset: around.offset,
        carryOver: choice,
      }),
    );
    if (answered === null) {
      stopSubmit({
        failure: SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.lockedProject],
      });
      return;
    }
    const result = answered.value;
    if (result.kind === "applied" || result.kind === "index-failed") {
      await finishApplied(result, around, choice.newName);
    } else if (result.kind === "stale") {
      stopSubmit({ refusalReason: SPLIT_REFUSAL_REASONS.staleCursor });
    } else if (result.kind === "refused") {
      stopSubmit({ refusalReason: result.reason });
    } else {
      stopSubmit({ failure: result.message });
    }
  }

  function confirm(choice: SplitCarryOverChoice): void {
    if (isSubmitting.current || !held.current) return;
    isSubmitting.current = true;
    setDialog((current) =>
      current ? { ...current, failure: undefined, isSubmitting: true } : null,
    );
    apply(choice)
      .catch((error: unknown) => {
        console.error("Split failed", error);
        stopSubmit({ failure: SPLIT_UNEXPECTED_FAILURE_MESSAGE });
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
        <SplitDialog
          isOpen={dialog !== null}
          preview={dialog?.preview ?? null}
          refusalReason={dialog?.refusalReason}
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
