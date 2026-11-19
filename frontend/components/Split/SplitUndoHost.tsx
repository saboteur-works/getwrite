"use client";

import React from "react";
import { useStore } from "react-redux";
import type { Editor } from "@tiptap/core";
import Button from "../common/UI/Button/Button";
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

const MESSAGE_BOX =
  "border border-gw-border bg-gw-chrome px-3 py-2 text-sm text-gw-primary";

type Committed = Extract<
  SplitUndoClientResult,
  { kind: "applied" | "index-failed" }
>;

/** What a finished Undo shows: a status text, alert texts, and whether the editor stays read-only. */
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

/**
 * Hosts "Undo split" (Feature 120, Task 32, FR-18). It reads the project's
 * latest-operation record when a surface that offers the action opens, keeps
 * the answer for the palette row and the editor menu item (`splitUndoRequest.ts`),
 * runs the Undo and reports it: the outcome of a success in a `role="status"`
 * region, a failure or a refusal and its cause in a `role="alert"` region.
 * The two regions are always in the page, so a change in them is announced.
 *
 * Before Undo is sent the editor's pending saves are sent and the editor is
 * held read-only, so no text can be saved over the result. After a committed
 * Undo the document the editor shows is read again from the store if it is the
 * document that was split (the only document whose stored text Undo changes in
 * place); a document that is unrelated is left as it is. If that read fails, or
 * the editor shows the document that went to the Trash, or a failed Undo leaves
 * the state not as it was, the editor stays read-only until another document is
 * opened (the editor releases itself on a document switch, as for Task 25).
 *
 * A locked project is reported, not unlocked from here: the unlock prompt of
 * the split host is not reused. A locked project met only when the stored text
 * is read back after a committed Undo is reported as the failed read-back.
 */
export default function SplitUndoHost(): JSX.Element {
  const store = useStore<RootState>();
  const dispatch = useAppDispatch();
  const trashRefresh = useOptionalTrashRefresh();
  const notifyProjectChanged = trashRefresh?.notifyTrashRestored;
  const [status, setStatus] = React.useState<string>("");
  const [alerts, setAlerts] = React.useState<string[]>([]);
  const isBusy = React.useRef<boolean>(false);
  const readToken = React.useRef<number>(0);
  const projectId = useAppSelector(selectActiveProjectDirectoryId);

  async function readLatest(
    projectDirectoryId: string,
  ): Promise<SplitUndoAvailability> {
    try {
      const result = await requestLatestSplitOperation(projectDirectoryId);
      if (result.kind === "failed") {
        return { kind: "read-failed", message: UNDO_SPLIT_READ_FAILED_MESSAGE };
      }
      if (result.kind === "none" || result.record.kind !== "split") {
        return { kind: "none" };
      }
      return { kind: "split", splitOffDocumentId: result.record.newDocumentId };
    } catch (error: unknown) {
      if (isLockedAccessError(error)) {
        return { kind: "read-failed", message: UNDO_SPLIT_READ_LOCKED_MESSAGE };
      }
      console.error("Reading the latest split operation failed", error);
      return { kind: "read-failed", message: UNDO_SPLIT_READ_FAILED_MESSAGE };
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

  async function refreshTree(projectDirectoryId: string): Promise<string[]> {
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
      console.error("Error refreshing project after Undo split:", error);
      return [UNDO_SPLIT_TREE_REFRESH_FAILED_MESSAGE];
    }
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
    // The Undo has already committed, so a locked project here is a failed
    // read-back (shown as such), not "the split was not undone".
    let after: Awaited<ReturnType<typeof readStoredCanonicalText>> = null;
    try {
      after = await readStoredCanonicalText(projectDirectoryId, openId);
    } catch (error: unknown) {
      if (!isLockedAccessError(error)) throw error;
    }
    const doc = after ? parseStoredDocument(after.content) : null;
    if (!doc) {
      return {
        alerts: [UNDO_SPLIT_RELOAD_FAILED_MESSAGE],
        notes: [],
        isHeld: true,
      };
    }
    showStoredDocumentInEditor(editor, doc);
    dispatch(
      updateResource({
        id: openId,
        wordCount: countWords(tiptapToPlainText(doc)),
      }),
    );
    return { alerts: [], notes: [], isHeld: false };
  }

  async function reportCommitted(
    result: Committed,
    projectDirectoryId: string,
    name: string | null,
    editor: Editor | null,
    openId: string | null,
  ): Promise<Report> {
    setSplitUndoAvailability({ kind: "none" });
    const treeAlerts = await refreshTree(projectDirectoryId);
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
    if (result.kind === "index-failed") {
      alerts.push(
        describeUndoSplitIndexFailure(result.failures.map((f) => f.step)),
      );
    }
    const text = describeUndoSplitSuccess(
      name,
      result.splitOffState,
      result.movedAnnotationIds.length,
    );
    return {
      status: [text, ...settled.notes].join(" "),
      alerts,
      isEditorHeld: settled.isHeld,
    };
  }

  /** The report for a result that is not a committed Undo. */
  function reportNotCommitted(
    result: Exclude<SplitUndoClientResult, Committed>,
  ): Report {
    let alert: string;
    let isEditorHeld = false;
    switch (result.kind) {
      case "nothing-to-undo":
        setSplitUndoAvailability({ kind: "none" });
        alert = UNDO_SPLIT_NOTHING_TO_UNDO_MESSAGE;
        break;
      case "unsupported-operation":
        setSplitUndoAvailability({ kind: "none" });
        alert = UNDO_SPLIT_UNSUPPORTED_OPERATION_MESSAGE;
        break;
      case "refused":
        alert = result.message;
        break;
      case "could-not-be-checked":
        alert = UNDO_SPLIT_COULD_NOT_BE_CHECKED_MESSAGE;
        break;
      // Task 40 placeholder, replaced by Task 41: this host only runs while
      // the stored record is a split, so a merge kind arrives only when the
      // record changed between the availability read and the request. It is
      // not shown as an Undo result here.
      case "merge-applied":
      case "merge-index-failed":
      case "merge-refused":
      case "merge-failed":
        setSplitUndoAvailability({ kind: "none" });
        alert = UNDO_SPLIT_COULD_NOT_BE_CHECKED_MESSAGE;
        break;
      case "failed":
        alert = describeUndoSplitFailure(
          result.failedStep,
          result.remainingState,
          result.cause,
        );
        isEditorHeld =
          result.cause !== "invalid-request" &&
          result.remainingState !== "split-restored";
        break;
    }
    return {
      status: "",
      alerts: isEditorHeld ? [alert, UNDO_SPLIT_EDITOR_HELD_MESSAGE] : [alert],
      isEditorHeld,
    };
  }

  async function run(projectDirectoryId: string): Promise<void> {
    const availability = getSplitUndoAvailability();
    const name =
      availability.kind === "split"
        ? resolveSplitOffName(
            projectResources(store.getState()),
            availability.splitOffDocumentId,
          )
        : null;
    const editor = getActiveEditor();
    const openId = getActiveEditorResourceId();
    const liveEditor = editor && !editor.isDestroyed ? editor : null;
    if (!(await flushPendingSaves())) {
      setStatus("");
      setAlerts([UNDO_SPLIT_SAVE_FAILED_MESSAGE]);
      return;
    }
    liveEditor?.setEditable(false, false);
    let report: Report;
    try {
      const result = await requestUndoSplit(projectDirectoryId);
      report =
        result.kind === "applied" || result.kind === "index-failed"
          ? await reportCommitted(
              result,
              projectDirectoryId,
              name,
              liveEditor,
              openId,
            )
          : reportNotCommitted(result);
    } catch (error: unknown) {
      if (!isLockedAccessError(error)) throw error;
      report = {
        status: "",
        alerts: [UNDO_SPLIT_LOCKED_MESSAGE],
        isEditorHeld: false,
      };
    } finally {
      isBusy.current = false;
    }
    if (liveEditor && !liveEditor.isDestroyed && !report.isEditorHeld) {
      liveEditor.setEditable(true, false);
    }
    setStatus(report.status);
    setAlerts(report.alerts);
  }

  function undo(): SplitUndoRequestOutcome {
    if (isBusy.current) return "busy";
    const projectDirectoryId = selectActiveProjectDirectoryId(store.getState());
    if (!projectDirectoryId) return "no-project";
    isBusy.current = true;
    setAlerts([]);
    setStatus(UNDO_SPLIT_WORKING_MESSAGE);
    run(projectDirectoryId).catch((error: unknown) => {
      console.error("Undo split failed", error);
      isBusy.current = false;
      setStatus("");
      setAlerts([UNDO_SPLIT_UNEXPECTED_FAILURE_MESSAGE]);
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

  return (
    <SplitUndoRegions
      status={status}
      alerts={alerts}
      onDismiss={() => {
        setStatus("");
        setAlerts([]);
      }}
    />
  );
}

export interface SplitUndoRegionsProps {
  /** The success report, or "" for none. Shown in a `role="status"` region. */
  status: string;
  /** Failure and refusal texts, shown in a `role="alert"` region. */
  alerts: string[];
  onDismiss: () => void;
}

/**
 * The two report regions of Undo split. Both are always in the page, empty
 * until there is something to say, so a change in them is announced. Dismiss
 * is offered once there is a message and Undo is no longer working.
 */
export function SplitUndoRegions({
  status,
  alerts,
  onDismiss,
}: SplitUndoRegionsProps): JSX.Element {
  const hasMessage = status !== "" || alerts.length > 0;
  return (
    <div className="fixed bottom-4 left-4 z-50 flex max-w-md flex-col gap-2">
      <div
        role="status"
        aria-live="polite"
        className={status === "" ? undefined : MESSAGE_BOX}
      >
        {status}
      </div>
      <div
        role="alert"
        className={alerts.length === 0 ? undefined : MESSAGE_BOX}
      >
        {alerts.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
      {hasMessage && status !== UNDO_SPLIT_WORKING_MESSAGE ? (
        <Button variant="secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      ) : null}
    </div>
  );
}
