"use client";

import React from "react";
import { useStore } from "react-redux";
import type { Editor } from "@tiptap/core";
import {
  getActiveEditor,
  getActiveEditorResourceId,
} from "../Editor/activeEditorRegistry";
import { useOptionalTrashRefresh } from "../Layout/TrashRefreshContext";
import {
  getSplitUndoAvailability,
  setSplitUndoAvailability,
  setSplitUndoController,
  type SplitUndoAvailability,
  type SplitUndoRequestOutcome,
} from "./splitUndoRequest";
import { resolveSplitOffName } from "./splitUndoName";
import {
  parseStoredDocument,
  readStoredCanonicalText,
  showStoredDocumentInEditor,
} from "./splitStoredDocument";
import {
  clearUndoStatus,
  clearUndoToasts,
  showUndoAlerts,
  showUndoStatus,
  showUndoWorking,
} from "./UndoToast";
import {
  describeUndoSplitFailure,
  describeUndoSplitIndexFailure,
  describeUndoSplitSuccess,
  UNDO_SPLIT_COULD_NOT_BE_CHECKED_MESSAGE,
  UNDO_SPLIT_EDITOR_HELD_MESSAGE,
  UNDO_SPLIT_LOCKED_MESSAGE,
  UNDO_SPLIT_NOTHING_TO_UNDO_MESSAGE,
  UNDO_SPLIT_OPEN_DOCUMENT_IN_TRASH_MESSAGE,
  UNDO_SPLIT_READ_FAILED_MESSAGE,
  UNDO_SPLIT_READ_LOCKED_MESSAGE,
  UNDO_SPLIT_RELOAD_FAILED_MESSAGE,
  UNDO_SPLIT_SAVE_FAILED_MESSAGE,
  UNDO_SPLIT_TREE_REFRESH_FAILED_MESSAGE,
  UNDO_SPLIT_UNEXPECTED_FAILURE_MESSAGE,
  UNDO_SPLIT_UNSUPPORTED_OPERATION_MESSAGE,
  UNDO_SPLIT_WORKING_MESSAGE,
} from "../../src/lib/models/split-messages";
import {
  describeUndoMergeFailure,
  describeUndoMergeIndexFailure,
  describeUndoMergeSuccess,
  UNDO_MERGE_COULD_NOT_BE_CHECKED_MESSAGE,
  UNDO_MERGE_EDITOR_HELD_MESSAGE,
  UNDO_MERGE_LOCKED_MESSAGE,
  UNDO_MERGE_NOTHING_TO_UNDO_MESSAGE,
  UNDO_MERGE_READ_FAILED_MESSAGE,
  UNDO_MERGE_READ_LOCKED_MESSAGE,
  UNDO_MERGE_RELOAD_FAILED_MESSAGE,
  UNDO_MERGE_SAVE_FAILED_MESSAGE,
  UNDO_MERGE_TREE_REFRESH_FAILED_MESSAGE,
  UNDO_MERGE_UNEXPECTED_FAILURE_MESSAGE,
  UNDO_MERGE_WORKING_MESSAGE,
} from "../../src/lib/models/merge-undo-messages";
import { openProject } from "../../src/lib/api/projects";
import {
  requestLatestSplitOperation,
  requestUndoSplit,
  type SplitUndoClientResult,
} from "../../src/lib/api/split";
import { flushPendingSaves } from "../../src/lib/pending-saves";
import { isLockedAccessError } from "../../src/lib/models/crypto/locked-errors";
import { tiptapToPlainText } from "../../src/lib/tiptap-text";
import { countWords } from "../../src/lib/word-count";
import { useAppDispatch, useAppSelector } from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import {
  loadResources,
  setFolders,
  updateResource,
} from "../../src/store/resourcesSlice";
import { loadRevisionsForSelectedResource } from "../../src/store/revisionsSlice";
import type { RootState } from "../../src/store/store";

type SplitCommitted = Extract<
  SplitUndoClientResult,
  { kind: "applied" | "index-failed" }
>;
type MergeCommitted = Extract<
  SplitUndoClientResult,
  { kind: "merge-applied" | "merge-index-failed" }
>;
type Committed = SplitCommitted | MergeCommitted;

/** Which operation the Undo was offered for; it words the outcomes the two share. */
type UndoOperation = "split" | "merge";

/** The words of the outcomes a split Undo and a merge Undo share. */
interface OperationTexts {
  working: string;
  saveFailed: string;
  locked: string;
  unexpected: string;
  nothingToUndo: string;
  couldNotBeChecked: string;
  editorHeld: string;
  reloadFailed: string;
  treeRefreshFailed: string;
}

const SPLIT_TEXTS: OperationTexts = {
  working: UNDO_SPLIT_WORKING_MESSAGE,
  saveFailed: UNDO_SPLIT_SAVE_FAILED_MESSAGE,
  locked: UNDO_SPLIT_LOCKED_MESSAGE,
  unexpected: UNDO_SPLIT_UNEXPECTED_FAILURE_MESSAGE,
  nothingToUndo: UNDO_SPLIT_NOTHING_TO_UNDO_MESSAGE,
  couldNotBeChecked: UNDO_SPLIT_COULD_NOT_BE_CHECKED_MESSAGE,
  editorHeld: UNDO_SPLIT_EDITOR_HELD_MESSAGE,
  reloadFailed: UNDO_SPLIT_RELOAD_FAILED_MESSAGE,
  treeRefreshFailed: UNDO_SPLIT_TREE_REFRESH_FAILED_MESSAGE,
};

const MERGE_TEXTS: OperationTexts = {
  working: UNDO_MERGE_WORKING_MESSAGE,
  saveFailed: UNDO_MERGE_SAVE_FAILED_MESSAGE,
  locked: UNDO_MERGE_LOCKED_MESSAGE,
  unexpected: UNDO_MERGE_UNEXPECTED_FAILURE_MESSAGE,
  nothingToUndo: UNDO_MERGE_NOTHING_TO_UNDO_MESSAGE,
  couldNotBeChecked: UNDO_MERGE_COULD_NOT_BE_CHECKED_MESSAGE,
  editorHeld: UNDO_MERGE_EDITOR_HELD_MESSAGE,
  reloadFailed: UNDO_MERGE_RELOAD_FAILED_MESSAGE,
  treeRefreshFailed: UNDO_MERGE_TREE_REFRESH_FAILED_MESSAGE,
};

function textsFor(operation: UndoOperation): OperationTexts {
  return operation === "merge" ? MERGE_TEXTS : SPLIT_TEXTS;
}

/** What a finished Undo shows: a success text, failure texts, and whether the editor stays read-only. */
interface Report {
  status: string;
  alerts: string[];
  isEditorHeld: boolean;
}

function projectResources(
  state: RootState,
): ReadonlyArray<{ id: string; name: string }> {
  return state.resources?.resources ?? [];
}

/** Puts a report on screen as toasts: success as a status toast, failures as an alert toast. */
function showReport(status: string, alerts: readonly string[]): void {
  if (status === "") clearUndoStatus();
  else showUndoStatus(status);
  if (alerts.length > 0) showUndoAlerts(alerts);
}

/**
 * Hosts "Undo split" (Feature 120, Task 32, FR-18) and "Undo merge" (Feature
 * 121, Task 41, FR-22). It reads the project's latest-operation record when a
 * surface that offers the action opens, keeps the answer for the palette row
 * and the editor menu item (`splitUndoRequest.ts`), runs the Undo and reports
 * it as dismissable toasts (`UndoToast.tsx`): a success as a `role="status"`
 * toast, a failure or a refusal and its cause as a `role="alert"` toast. This
 * replaces the two fixed regions of Feature 120 for both operations, by owner
 * decision (the follow-up of the Feature 120 owner run).
 *
 * Before Undo is sent the editor's pending saves are sent and the editor is
 * held read-only, so no text can be saved over the result. After a committed
 * Undo the document the editor shows is read again from the store when Undo
 * changed its stored text in place: the original of a split; the target and
 * each absorbed document of a merge. A document that is unrelated is left as
 * it is. If that read fails, or the editor shows the document that went to the
 * Trash, or a failed Undo leaves the state not as it was, the editor stays
 * read-only until another document is opened (the editor releases itself on a
 * document switch, as for Task 25).
 *
 * A locked project is reported, not unlocked from here: the unlock prompt of
 * the split host is not reused. A locked project met only when the stored text
 * is read back after a committed Undo is reported as the failed read-back.
 */
export default function SplitUndoHost(): null {
  const store = useStore<RootState>();
  const dispatch = useAppDispatch();
  const trashRefresh = useOptionalTrashRefresh();
  const notifyProjectChanged = trashRefresh?.notifyTrashRestored;
  const isBusy = React.useRef<boolean>(false);
  const readToken = React.useRef<number>(0);
  const projectId = useAppSelector(selectActiveProjectDirectoryId);

  async function readLatest(
    projectDirectoryId: string,
  ): Promise<SplitUndoAvailability> {
    try {
      const result = await requestLatestSplitOperation(projectDirectoryId);
      if (result.kind === "failed") {
        return {
          kind: "read-failed",
          message: UNDO_SPLIT_READ_FAILED_MESSAGE,
          mergeMessage: UNDO_MERGE_READ_FAILED_MESSAGE,
        };
      }
      if (result.kind === "none") return { kind: "none" };
      if (result.record.kind === "merge") {
        const [targetDocumentId] = result.record.affectedDocumentIds;
        return {
          kind: "merge",
          targetDocumentId,
          absorbedCount: result.record.affectedDocumentIds.length - 1,
        };
      }
      return { kind: "split", splitOffDocumentId: result.record.newDocumentId };
    } catch (error: unknown) {
      if (isLockedAccessError(error)) {
        return {
          kind: "read-failed",
          message: UNDO_SPLIT_READ_LOCKED_MESSAGE,
          mergeMessage: UNDO_MERGE_READ_LOCKED_MESSAGE,
        };
      }
      console.error(
        "Reading the latest split or merge operation failed",
        error,
      );
      return {
        kind: "read-failed",
        message: UNDO_SPLIT_READ_FAILED_MESSAGE,
        mergeMessage: UNDO_MERGE_READ_FAILED_MESSAGE,
      };
    }
  }

  function refresh(): void {
    const projectDirectoryId = selectActiveProjectDirectoryId(store.getState());
    const token = ++readToken.current;
    setSplitUndoAvailability({ kind: "unknown" });
    if (process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native") return;
    if (!projectDirectoryId) return;
    void readLatest(projectDirectoryId).then((next) => {
      if (token !== readToken.current) return;
      setSplitUndoAvailability(next);
    });
  }

  async function refreshTree(
    projectDirectoryId: string,
    treeRefreshFailed: string,
  ): Promise<string[]> {
    try {
      const opened = await openProject(projectDirectoryId);
      if (!Array.isArray(opened.resources) || !Array.isArray(opened.folders)) {
        throw new Error("The project read returned no resources or folders.");
      }
      if (
        selectActiveProjectDirectoryId(store.getState()) === projectDirectoryId
      ) {
        dispatch(
          loadResources({
            resources: opened.resources,
            projectId: projectDirectoryId,
          }),
        );
        dispatch(setFolders(opened.folders));
        notifyProjectChanged?.();
      }
      return [];
    } catch (error: unknown) {
      console.error("Error refreshing project after Undo:", error);
      return [treeRefreshFailed];
    }
  }

  /**
   * Reads the stored text of the open document back into the editor. The Undo
   * has already committed, so a locked project here is a failed read-back
   * (shown as such), not "the Undo did not happen".
   */
  async function readBackIntoEditor(
    editor: Editor,
    openId: string,
    projectDirectoryId: string,
    reloadFailed: string,
  ): Promise<{ alerts: string[]; notes: string[]; isHeld: boolean }> {
    let after: Awaited<ReturnType<typeof readStoredCanonicalText>> = null;
    try {
      after = await readStoredCanonicalText(projectDirectoryId, openId);
    } catch (error: unknown) {
      if (!isLockedAccessError(error)) throw error;
    }
    const doc = after ? parseStoredDocument(after.content) : null;
    if (!doc) return { alerts: [reloadFailed], notes: [], isHeld: true };
    showStoredDocumentInEditor(editor, doc);
    dispatch(
      updateResource({
        id: openId,
        wordCount: countWords(tiptapToPlainText(doc)),
      }),
    );
    return { alerts: [], notes: [], isHeld: false };
  }

  /** The editor after a committed Undo; returns the texts to add and whether it stays read-only. */
  async function settleEditor(
    editor: Editor | null,
    openId: string | null,
    projectDirectoryId: string,
    result: Committed,
  ): Promise<{ alerts: string[]; notes: string[]; isHeld: boolean }> {
    if (!editor || editor.isDestroyed || !openId) {
      return { alerts: [], notes: [], isHeld: false };
    }
    if (
      result.kind === "merge-applied" ||
      result.kind === "merge-index-failed"
    ) {
      const skipped = new Set(result.skippedDocuments.map((s) => s.documentId));
      const changed = [result.targetDocumentId, ...result.absorbedDocumentIds];
      if (!changed.includes(openId) || skipped.has(openId)) {
        return { alerts: [], notes: [], isHeld: false };
      }
      return readBackIntoEditor(
        editor,
        openId,
        projectDirectoryId,
        UNDO_MERGE_RELOAD_FAILED_MESSAGE,
      );
    }
    if (openId === result.splitOffDocumentId) {
      return {
        alerts: [],
        notes: [UNDO_SPLIT_OPEN_DOCUMENT_IN_TRASH_MESSAGE],
        isHeld: true,
      };
    }
    if (openId !== result.originalDocumentId) {
      return { alerts: [], notes: [], isHeld: false };
    }
    return readBackIntoEditor(
      editor,
      openId,
      projectDirectoryId,
      UNDO_SPLIT_RELOAD_FAILED_MESSAGE,
    );
  }

  /** The success text and, for a failed index update, its alert. */
  function committedTexts(
    result: Committed,
    name: string | null,
  ): { text: string; indexAlert: string | null } {
    if (
      result.kind === "merge-applied" ||
      result.kind === "merge-index-failed"
    ) {
      return {
        text: describeUndoMergeSuccess(
          result.targetName ?? name,
          result.absorbedCount,
          result.skippedDocuments.length,
          result.movedAnnotationIds.length,
        ),
        indexAlert:
          result.kind === "merge-index-failed"
            ? describeUndoMergeIndexFailure(result.failures.map((f) => f.step))
            : null,
      };
    }
    return {
      text: describeUndoSplitSuccess(
        name,
        result.splitOffState,
        result.movedAnnotationIds.length,
      ),
      indexAlert:
        result.kind === "index-failed"
          ? describeUndoSplitIndexFailure(result.failures.map((f) => f.step))
          : null,
    };
  }

  async function reportCommitted(
    result: Committed,
    projectDirectoryId: string,
    name: string | null,
    editor: Editor | null,
    openId: string | null,
  ): Promise<Report> {
    setSplitUndoAvailability({ kind: "none" });
    const texts = textsFor(
      result.kind === "merge-applied" || result.kind === "merge-index-failed"
        ? "merge"
        : "split",
    );
    const treeAlerts = await refreshTree(
      projectDirectoryId,
      texts.treeRefreshFailed,
    );
    if (openId) {
      void dispatch(loadRevisionsForSelectedResource({ resourceId: openId }));
    }
    const settled = await settleEditor(
      editor,
      openId,
      projectDirectoryId,
      result,
    );
    const alerts = [...settled.alerts, ...treeAlerts];
    const { text, indexAlert } = committedTexts(result, name);
    if (indexAlert !== null) alerts.push(indexAlert);
    return {
      status: [text, ...settled.notes].join(" "),
      alerts,
      isEditorHeld: settled.isHeld,
    };
  }

  /** The report for a failed result (split or merge): where it stopped and what remains. */
  function reportFailed(
    result: Extract<SplitUndoClientResult, { kind: "failed" | "merge-failed" }>,
    operation: UndoOperation,
  ): Report {
    let alert: string;
    let isRestored: boolean;
    let held: string;
    if (result.kind === "merge-failed") {
      alert = describeUndoMergeFailure(
        result.failedStep,
        result.remainingState,
        result.cause,
      );
      isRestored = result.remainingState === "merge-restored";
      held = MERGE_TEXTS.editorHeld;
    } else if (operation === "merge") {
      // The client's own failures (the request never ran, or its outcome is
      // unknown) carry no merge state; the cause alone picks the text.
      alert = describeUndoMergeFailure(null, "state-unknown", result.cause);
      isRestored = false;
      held = MERGE_TEXTS.editorHeld;
    } else {
      alert = describeUndoSplitFailure(
        result.failedStep,
        result.remainingState,
        result.cause,
      );
      isRestored = result.remainingState === "split-restored";
      held = SPLIT_TEXTS.editorHeld;
    }
    const isEditorHeld = result.cause !== "invalid-request" && !isRestored;
    return {
      status: "",
      alerts: isEditorHeld ? [alert, held] : [alert],
      isEditorHeld,
    };
  }

  /** The report for a result that is not a committed Undo. */
  function reportNotCommitted(
    result: Exclude<SplitUndoClientResult, Committed>,
    operation: UndoOperation,
  ): Report {
    const texts = textsFor(operation);
    let alert: string;
    switch (result.kind) {
      case "nothing-to-undo":
        setSplitUndoAvailability({ kind: "none" });
        alert = texts.nothingToUndo;
        break;
      case "unsupported-operation":
        setSplitUndoAvailability({ kind: "none" });
        alert = UNDO_SPLIT_UNSUPPORTED_OPERATION_MESSAGE;
        break;
      case "refused":
      case "merge-refused":
        alert = result.message;
        break;
      case "could-not-be-checked":
        alert = texts.couldNotBeChecked;
        break;
      case "failed":
      case "merge-failed":
        return reportFailed(result, operation);
    }
    return { status: "", alerts: [alert], isEditorHeld: false };
  }

  async function run(projectDirectoryId: string): Promise<void> {
    const availability = getSplitUndoAvailability();
    const operation: UndoOperation =
      availability.kind === "merge" ? "merge" : "split";
    const texts = textsFor(operation);
    const name =
      availability.kind === "split"
        ? resolveSplitOffName(
            projectResources(store.getState()),
            availability.splitOffDocumentId,
          )
        : availability.kind === "merge"
          ? resolveSplitOffName(
              projectResources(store.getState()),
              availability.targetDocumentId,
            )
          : null;
    const editor = getActiveEditor();
    const openId = getActiveEditorResourceId();
    const liveEditor = editor && !editor.isDestroyed ? editor : null;
    if (!(await flushPendingSaves())) {
      showReport("", [texts.saveFailed]);
      return;
    }
    liveEditor?.setEditable(false, false);
    let report: Report;
    try {
      const result = await requestUndoSplit(projectDirectoryId);
      report =
        result.kind === "applied" ||
        result.kind === "index-failed" ||
        result.kind === "merge-applied" ||
        result.kind === "merge-index-failed"
          ? await reportCommitted(
              result,
              projectDirectoryId,
              name,
              liveEditor,
              openId,
            )
          : reportNotCommitted(result, operation);
    } catch (error: unknown) {
      if (!isLockedAccessError(error)) throw error;
      report = { status: "", alerts: [texts.locked], isEditorHeld: false };
    } finally {
      isBusy.current = false;
    }
    if (liveEditor && !liveEditor.isDestroyed && !report.isEditorHeld) {
      liveEditor.setEditable(true, false);
    }
    showReport(report.status, report.alerts);
  }

  function undo(): SplitUndoRequestOutcome {
    if (isBusy.current) return "busy";
    const projectDirectoryId = selectActiveProjectDirectoryId(store.getState());
    if (!projectDirectoryId) return "no-project";
    isBusy.current = true;
    const operation: UndoOperation =
      getSplitUndoAvailability().kind === "merge" ? "merge" : "split";
    clearUndoToasts();
    showUndoWorking(textsFor(operation).working);
    run(projectDirectoryId).catch((error: unknown) => {
      console.error("Undo failed", error);
      isBusy.current = false;
      clearUndoStatus();
      showUndoAlerts([textsFor(operation).unexpected]);
      const editor = getActiveEditor();
      if (editor && !editor.isDestroyed) editor.setEditable(true, false);
    });
    return "started";
  }

  const controllerRef = React.useRef({ refresh, undo });
  controllerRef.current = { refresh, undo };
  React.useEffect(() => {
    setSplitUndoController({
      refresh: () => controllerRef.current.refresh(),
      undo: () => controllerRef.current.undo(),
    });
    return () => setSplitUndoController(null);
  }, []);

  // A different project has its own latest operation: forget what was read.
  React.useEffect(() => {
    readToken.current += 1;
    setSplitUndoAvailability({ kind: "unknown" });
  }, [projectId]);

  return null;
}
