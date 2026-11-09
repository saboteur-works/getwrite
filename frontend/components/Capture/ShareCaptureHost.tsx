"use client";

import React from "react";
import { useAppSelector } from "../../src/store/hooks";
import Button from "../common/UI/Button/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../common/UI/Dialog";
import ShareSheet from "./ShareSheet";
import { useCaptureProjectChoice } from "../../src/hooks/useCaptureProjectChoice";
import { startShareListener } from "../../src/lib/api/share-in";
import type { InboxTrashChoice } from "../../src/lib/api/inbox-capture-types";
import type {
  ShareItemResult,
  ShareReceivedEvent,
  ShareResult,
} from "../../src/lib/api/share-capture-types";
import { writeLastCapturedProjectId } from "../../src/lib/capture-preferences";
import {
  INITIAL_SHARE_SESSION,
  shareSessionReducer,
  type ShareSessionAction,
  type ShareSessionState,
} from "../../src/lib/share-session";
import {
  runShare,
  type ShareRunOptions,
  type ShareRunOutcome,
  type ShareRunProgress,
} from "../../src/lib/share-runner";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import type {
  ShareListenerOptions,
  ShareListenerSession,
} from "../../src/store/transport/native-share-in-plugin";

export interface ShareCaptureHostProps {
  /** Starts the share listener; defaults to the real wrapper. Tests pass a fake. */
  startListener?: (
    options: ShareListenerOptions,
  ) => Promise<ShareListenerSession>;
  /** Captures a share; defaults to the real runner. Tests pass a fake. */
  run?: (
    share: ShareReceivedEvent,
    projectId: string,
    options?: ShareRunOptions,
  ) => Promise<ShareRunOutcome>;
}

const NOTHING_CAPTURED_PREFIX = "Nothing was captured: ";
const CHOICE_TITLE = "This project's Inbox is in Trash";
const CHOICE_DESCRIPTION =
  "Restore the Inbox from Trash and add these items to it, or make a new Inbox. Cancel to capture nothing more.";
const CHOICE_CANCELLED_REASON =
  "the project's Inbox is in Trash and you chose neither to restore it nor to make a new one.";
const CHOICE_CANCELLED_ITEM = "The Inbox is in Trash and you did not choose.";
const EMPTY_SHARE_REASON = "the share held nothing to capture.";

/** Drops the prefix the reducer adds, so a message is never prefixed twice. */
function stripNothingCaptured(message: string): string {
  return message.startsWith(NOTHING_CAPTURED_PREFIX)
    ? message.slice(NOTHING_CAPTURED_PREFIX.length)
    : message;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Builds the share's result from what was settled and marks every other item
 * with `status` and `message`, so an item never disappears from the result.
 */
function completeResult(
  share: ShareReceivedEvent,
  settled: readonly ShareItemResult[],
  status: "failed" | "refused",
  message: string,
): ShareResult {
  const byIndex = new Map(settled.map((r) => [r.index, r]));
  const items: ShareItemResult[] = share.items.map(
    (item, index) =>
      byIndex.get(index) ?? { status, index, kind: item.kind, message },
  );
  return {
    shareId: share.shareId,
    items,
    capturedCount: items.filter((i) => i.status === "captured").length,
  };
}

interface FlowProps {
  share: ShareReceivedEvent;
  state: ShareSessionState;
  dispatch: React.Dispatch<ShareSessionAction>;
  run: NonNullable<ShareCaptureHostProps["run"]>;
}

interface PendingChoice {
  projectId: string;
  progress: ShareRunProgress;
}

/**
 * The sheet and prompts for one share. Mounted with `key={shareId}` so each
 * share reads the project list afresh and never shows a stale list state.
 */
function ShareFlow({ share, state, dispatch, run }: FlowProps): JSX.Element {
  const openProjectId = useAppSelector(selectActiveProjectDirectoryId);
  const choice = useCaptureProjectChoice(true, openProjectId);
  const [pendingChoice, setPendingChoice] =
    React.useState<PendingChoice | null>(null);

  React.useEffect(() => {
    if (choice.status === "ready" || choice.status === "empty") {
      dispatch({
        type: "projectsLoaded",
        projectIds: choice.options.map((o) => o.id),
      });
    }
  }, [choice.status, choice.options, dispatch]);

  function settle(projectId: string, result: ShareResult): void {
    if (result.capturedCount > 0) writeLastCapturedProjectId(projectId);
    dispatch({ type: "finished", result });
  }

  function handleOutcome(projectId: string, outcome: ShareRunOutcome): void {
    switch (outcome.status) {
      case "done":
        settle(projectId, outcome.result);
        return;
      case "needs-choice":
        setPendingChoice({ projectId, progress: outcome.progress });
        return;
      case "refused":
        dispatch({
          type: "refused",
          reason: stripNothingCaptured(outcome.message),
        });
        return;
      case "failed":
        dispatch({ type: "refused", reason: EMPTY_SHARE_REASON });
        return;
      case "stopped":
        settle(
          projectId,
          completeResult(
            share,
            outcome.results,
            "failed",
            `Not captured: ${errorText(outcome.error)}`,
          ),
        );
        return;
    }
  }

  async function execute(
    projectId: string,
    options: ShareRunOptions,
  ): Promise<void> {
    try {
      handleOutcome(projectId, await run(share, projectId, options));
    } catch (error: unknown) {
      settle(
        projectId,
        completeResult(
          share,
          options.progress?.results ?? [],
          "failed",
          `The item could not be captured: ${errorText(error)}`,
        ),
      );
    }
  }

  function confirm(projectId: string): void {
    if (state.phase !== "choosing") return;
    dispatch({ type: "projectChosen", projectId });
    void execute(projectId, {});
  }

  function chooseInbox(inboxChoice: InboxTrashChoice): void {
    if (!pendingChoice) return;
    const { projectId, progress } = pendingChoice;
    setPendingChoice(null);
    void execute(projectId, { inboxChoice, progress });
  }

  function cancelInboxChoice(): void {
    if (!pendingChoice) return;
    const { progress } = pendingChoice;
    setPendingChoice(null);
    if (progress.results.length === 0) {
      dispatch({ type: "refused", reason: CHOICE_CANCELLED_REASON });
      return;
    }
    dispatch({
      type: "finished",
      result: completeResult(
        share,
        progress.results,
        "refused",
        CHOICE_CANCELLED_ITEM,
      ),
    });
  }

  /** A write in progress cannot be stopped, so Cancel only acts while choosing. */
  function cancel(): void {
    if (state.phase === "choosing" || state.phase === "needs-project") {
      dispatch({ type: "cancel" });
    }
  }

  const { outcome } = state;
  if (state.phase === "ended" && outcome && outcome.kind !== "result") {
    return (
      <NoticeDialog
        message={outcome.message}
        onDone={() => dispatch({ type: "dismiss" })}
      />
    );
  }

  const isResult = state.phase === "ended" && outcome?.kind === "result";
  const sheetPhase = isResult
    ? "result"
    : state.phase === "running"
      ? "pending"
      : "picking";

  return (
    <>
      <ShareSheet
        isOpen={pendingChoice === null}
        phase={sheetPhase}
        items={share.items}
        status={choice.status}
        options={choice.options}
        defaultProjectId={choice.defaultProjectId}
        errorMessage={choice.errorMessage}
        onRetry={choice.retry}
        onConfirm={confirm}
        onCancel={cancel}
        onDone={() => dispatch({ type: "dismiss" })}
        queuedCount={state.queuedCount}
        result={outcome?.kind === "result" ? outcome.result : undefined}
      />
      <Dialog
        open={pendingChoice !== null}
        onOpenChange={(open) => {
          if (!open) cancelInboxChoice();
        }}
      >
        <DialogContent maxWidth="max-w-[480px]" className="p-6">
          <DialogTitle>{CHOICE_TITLE}</DialogTitle>
          <DialogDescription>{CHOICE_DESCRIPTION}</DialogDescription>
          <DialogFooter>
            <Button variant="secondary" onClick={cancelInboxChoice}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => chooseInbox("new")}>
              Make a new one
            </Button>
            <Button variant="outline" onClick={() => chooseInbox("restore")}>
              Restore it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface NoticeDialogProps {
  message: string;
  onDone: () => void;
}

/** One message the writer must see: a refusal or a share that could not be read. */
function NoticeDialog({ message, onDone }: NoticeDialogProps): JSX.Element {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onDone();
      }}
    >
      <DialogContent maxWidth="max-w-[480px]" className="p-6">
        <DialogTitle>Share to GetWrite</DialogTitle>
        <DialogDescription>
          What happened to the shared items.
        </DialogDescription>
        <p role="alert" className="mt-4 text-sm text-gw-primary">
          {message}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Receives shares from the Android share target and drives them through the
 * session reducer and the runner (Feature 107). Mounted in `AppShell` on a
 * native runtime only, so the listener exists from the shell's first mount and
 * not from the first Capture open. A share is held in component state only
 * while its sheet is open; nothing is written before the writer confirms.
 *
 * It needs no sharing-limits context: no unlock prompt can occur on native
 * (an encrypted-marked project is refused by the capture guard), so the host
 * never renders an unlock dialog. Shares its state with nothing, including the
 * typed Capture box host.
 */
export default function ShareCaptureHost({
  startListener = startShareListener,
  run = runShare,
}: ShareCaptureHostProps): JSX.Element | null {
  const [state, dispatch] = React.useReducer(
    shareSessionReducer,
    INITIAL_SHARE_SESSION,
  );
  const [notice, setNotice] = React.useState<string | null>(null);
  const lastShare = React.useRef<ShareReceivedEvent | null>(null);
  if (state.current) lastShare.current = state.current;

  React.useEffect(() => {
    let isActive = true;
    let session: ShareListenerSession | null = null;
    startListener({
      onShare: (event) => {
        dispatch({ type: "received", share: event });
      },
      onFailure: (message) => setNotice(message),
    })
      .then((started) => {
        if (isActive) session = started;
        else void started.stop();
      })
      .catch((error: unknown) => {
        if (isActive) {
          setNotice(
            `Sharing into GetWrite is unavailable: ${errorText(error)}`,
          );
        }
      });
    return () => {
      isActive = false;
      if (session) void session.stop();
    };
    // The listener is added once, at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share =
    state.current ?? (state.phase === "ended" ? lastShare.current : null);

  return (
    <>
      {share ? (
        <ShareFlow
          key={share.shareId}
          share={share}
          state={state}
          dispatch={dispatch}
          run={run}
        />
      ) : null}
      {notice !== null ? (
        <NoticeDialog message={notice} onDone={() => setNotice(null)} />
      ) : null}
    </>
  );
}
