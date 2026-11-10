"use client";

import React from "react";
import { useStore } from "react-redux";
import UnlockModal from "../common/UnlockModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../common/UI/Dialog";
import {
  useDeclareUnlockPromptMounted,
  useSharingLimits,
} from "../Sharing/SharingLimitsContext";
import {
  isUnlockingLimited,
  isUnlockPromptAllowed,
} from "../Sharing/unlock-prompt-gate";
import { useAppDispatch, useAppSelector } from "../../src/store/hooks";
import { unlockWorkspace } from "../../src/store/cryptoSlice";
import CaptureBox, {
  captureConfirmationMessage,
  describeCaptureIssue,
  type CaptureBoxIssue,
} from "./CaptureBox";
import Button from "../common/UI/Button/Button";
import Select from "../common/UI/Select/Select";
import {
  useCaptureProjectChoice,
  type CaptureProjectOption,
} from "../../src/hooks/useCaptureProjectChoice";
import { captureToInbox } from "../../src/lib/api/inbox-capture";
import type {
  CaptureCreated,
  CaptureNotice,
  CaptureRequest,
  CaptureResult,
  InboxTrashChoice,
} from "../../src/lib/api/inbox-capture-types";
import { isEncryptedProjectCaptureRefusal } from "../../src/lib/api/encrypted-project-refusal";
import { isLimitRefusalError } from "../../src/lib/api/limit-refusal";
import { writeLastCapturedProjectId } from "../../src/lib/capture-preferences";
import { CAPTURE_TEXT_MAX_LENGTH } from "../../src/lib/models/inbox-capture-text";
import { isLockedAccessError } from "../../src/lib/models/crypto/locked-errors";
import {
  selectActiveProjectDirectoryId,
  setProject,
} from "../../src/store/projectsSlice";
import type { RootState } from "../../src/store/store";
import { findStoredByDirectoryId } from "./stored-project-inbox";
import { useRefreshOpenProjectTree } from "./useRefreshOpenProjectTree";

export interface CaptureBoxHostProps {
  /** Whether the Capture box is open. */
  isOpen: boolean;
  /** Called when the box should close (Escape, Close, or after a capture). */
  onClose: () => void;
  /** The capture call; defaults to the real client. Tests pass a fake. */
  capture?: (request: CaptureRequest) => Promise<CaptureResult>;
  /**
   * Unlocks the workspace with a passphrase; rejects on failure. Defaults to
   * the crypto slice's `unlockWorkspace` thunk. Tests and stories pass a fake.
   */
  unlock?: (passphrase: string) => Promise<void>;
}

/** The capture the writer submitted, held in memory while a prompt is open. */
interface HeldCapture {
  project: CaptureProjectOption;
  text: string;
}

type PromptKind = "unlock" | "choice" | null;

const CHOICE_TITLE = "This project's Inbox is in Trash";
const CHOICE_DESCRIPTION =
  "Restore the Inbox from Trash and add this item to it, or make a new Inbox. Cancel to keep your text and capture nothing.";

/** Notice codes that mean the item was captured but something else failed. */
const NOTICE_ISSUES: Partial<Record<CaptureNotice["code"], CaptureBoxIssue>> = {
  seeding: { kind: "seedingNotice" },
  "writing-log": { kind: "writingLogNotice" },
};

function refusalIssue(notices: CaptureNotice[]): CaptureBoxIssue {
  const codes = notices.map((n) => n.code);
  if (codes.includes("text-too-long")) {
    return { kind: "textTooLong", limit: CAPTURE_TEXT_MAX_LENGTH };
  }
  if (codes.includes("empty")) return { kind: "emptyText" };
  return { kind: "server" };
}

/**
 * Names each failure kind separately. The capture client rejects with the
 * server's message only, so a missing project is recognised by its message
 * text and a refused paired device by `LimitRefusalError` or an HTTP 403
 * message; both are best effort and anything else is reported as a server
 * error, never as success.
 */
function classifyError(error: unknown): CaptureBoxIssue {
  if (isEncryptedProjectCaptureRefusal(error)) {
    return { kind: "encryptedRefused", message: error.message };
  }
  if (isLimitRefusalError(error)) return { kind: "pairedRefused" };
  if (error instanceof TypeError) return { kind: "network" };
  const message = error instanceof Error ? error.message : "";
  if (/HTTP 403/.test(message)) return { kind: "pairedRefused" };
  if (/HTTP 404|not found|could not be found/i.test(message)) {
    return { kind: "projectNotFound" };
  }
  return { kind: "server" };
}

function optionText(option: CaptureProjectOption): string {
  if (option.kind === "locked") {
    const date = new Date(option.encryptedAt);
    const when = Number.isNaN(date.getTime())
      ? ""
      : ` (encrypted ${date.toLocaleDateString("en-US")})`;
    return `${option.label}${when}`;
  }
  return option.label;
}

/**
 * Hosts the Capture box: fills in the project choice, calls the capture
 * client, shows each notice and failure, and closes with a confirmation on
 * success. The typed text lives in component state only.
 */
export default function CaptureBoxHost({
  isOpen,
  onClose,
  capture = captureToInbox,
  unlock,
}: CaptureBoxHostProps): JSX.Element {
  const store = useStore<RootState>();
  const dispatch = useAppDispatch();
  const openProjectId = useAppSelector(selectActiveProjectDirectoryId);
  const choice = useCaptureProjectChoice(isOpen, openProjectId);
  const refreshOpenProjectTree = useRefreshOpenProjectTree();
  const {
    state: limitsState,
    hasDesktopBridge,
    refresh: refreshLimits,
  } = useSharingLimits();
  const encryptedProjectCount = useAppSelector(
    (s) => s.crypto?.encryptedProjectIds.length ?? 0,
  );
  const [text, setText] = React.useState<string>("");
  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const [issue, setIssue] = React.useState<CaptureBoxIssue | undefined>();
  const [confirmation, setConfirmation] = React.useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [prompt, setPrompt] = React.useState<PromptKind>(null);
  const [isUnlocking, setIsUnlocking] = React.useState<boolean>(false);
  const [unlockError, setUnlockError] = React.useState<string | undefined>();
  const inFlight = React.useRef<boolean>(false);
  const wasOpen = React.useRef<boolean>(false);
  const held = React.useRef<HeldCapture | null>(null);

  const isUnlockPromptShown =
    prompt === "unlock" && isUnlockPromptAllowed(limitsState, hasDesktopBridge);
  useDeclareUnlockPromptMounted(isUnlockPromptShown);

  React.useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setIssue(undefined);
      setConfirmation(undefined);
      setChosenId(null);
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  const selected: CaptureProjectOption | undefined =
    choice.options.find((o) => o.id === chosenId) ??
    choice.options.find((o) => o.id === choice.defaultProjectId);

  function refreshStoredInbox(result: CaptureCreated, projectId: string): void {
    const stored = findStoredByDirectoryId(
      store.getState().projects?.projects ?? {},
      projectId,
    );
    if (!stored || stored.inboxFolderId === result.inboxFolderId) return;
    store.dispatch(
      setProject({ ...stored, inboxFolderId: result.inboxFolderId }),
    );
  }

  /** Ends the attempt with nothing captured: the text stays in the box. */
  function fail(next: CaptureBoxIssue): void {
    held.current = null;
    setPrompt(null);
    setIssue(next);
    inFlight.current = false;
    setIsSubmitting(false);
  }

  function finishCreated(
    result: CaptureCreated,
    project: CaptureProjectOption,
  ): void {
    writeLastCapturedProjectId(project.id);
    refreshStoredInbox(result, project.id);
    void refreshOpenProjectTree(project.id);
    const noticeIssues = result.notices
      .map((n) => NOTICE_ISSUES[n.code])
      .filter((i): i is CaptureBoxIssue => i !== undefined);
    const otherMessages = [
      ...noticeIssues.slice(1).map((i) => describeCaptureIssue(i).message),
      ...result.notices
        .filter((n) => NOTICE_ISSUES[n.code] === undefined)
        .map((n) => n.message),
    ];
    setConfirmation(
      [captureConfirmationMessage(project.label), ...otherMessages].join(". "),
    );
    setText("");
    held.current = null;
    setPrompt(null);
    inFlight.current = false;
    setIsSubmitting(false);
    if (noticeIssues.length > 0) {
      setIssue(noticeIssues[0]);
      return;
    }
    setIssue(undefined);
    onClose();
  }

  /**
   * Decides whether the unlock prompt may open, from a fresh read of the
   * limits, and opens it or ends the attempt with the reason.
   */
  async function beginUnlock(capturing: HeldCapture): Promise<void> {
    held.current = capturing;
    const fresh = await refreshLimits();
    if (isUnlockingLimited(fresh)) {
      fail({ kind: "lockedLimited" });
      return;
    }
    if (!isUnlockPromptAllowed(fresh, hasDesktopBridge)) {
      fail({ kind: "lockedDeclined" });
      return;
    }
    setUnlockError(undefined);
    setPrompt("unlock");
  }

  /**
   * Sends the held capture. A locked project opens the unlock prompt unless
   * this send already follows an unlock, so there is never a second retry.
   */
  async function send(
    capturing: HeldCapture,
    options: { inboxChoice?: InboxTrashChoice; afterUnlock?: boolean } = {},
  ): Promise<void> {
    try {
      const result = await capture({
        projectId: capturing.project.id,
        text: capturing.text,
        origin: "typed",
        ...(options.inboxChoice ? { inboxChoice: options.inboxChoice } : {}),
      });
      if (result.status === "created") {
        finishCreated(result, capturing.project);
      } else if (result.status === "refused") {
        fail(refusalIssue(result.notices));
      } else {
        held.current = capturing;
        setPrompt("choice");
      }
    } catch (error) {
      if (isLockedAccessError(error) && !options.afterUnlock) {
        await beginUnlock(capturing);
        return;
      }
      fail(
        isLockedAccessError(error) ? { kind: "server" } : classifyError(error),
      );
    }
  }

  async function handleSubmit(): Promise<void> {
    if (inFlight.current || !selected) return;
    if (text.trim().length === 0) {
      setIssue({ kind: "emptyText" });
      return;
    }
    inFlight.current = true;
    setIsSubmitting(true);
    setIssue(undefined);
    setConfirmation(undefined);
    const capturing: HeldCapture = { project: selected, text };
    if (selected.kind === "locked") {
      await beginUnlock(capturing);
      return;
    }
    await send(capturing);
  }

  async function runUnlock(passphrase: string): Promise<void> {
    if (unlock) return unlock(passphrase);
    await dispatch(unlockWorkspace(passphrase)).unwrap();
  }

  async function submitUnlock(passphrase: string): Promise<void> {
    const capturing = held.current;
    if (!capturing) return;
    setIsUnlocking(true);
    const fresh = await refreshLimits();
    if (!isUnlockPromptAllowed(fresh, hasDesktopBridge)) {
      setIsUnlocking(false);
      fail({
        kind: isUnlockingLimited(fresh) ? "lockedLimited" : "lockedDeclined",
      });
      return;
    }
    try {
      await runUnlock(passphrase);
    } catch (error) {
      setUnlockError(unlockFailureMessage(error));
      setIsUnlocking(false);
      return;
    }
    setIsUnlocking(false);
    setPrompt(null);
    await send(capturing, { afterUnlock: true });
  }

  function chooseInbox(inboxChoice: InboxTrashChoice): void {
    const capturing = held.current;
    if (!capturing) return;
    setPrompt(null);
    void send(capturing, { inboxChoice });
  }

  // The limits can change while the prompt is open (the shared read polls);
  // when unlocking becomes limited the prompt unmounts, so end the attempt.
  React.useEffect(() => {
    if (prompt !== "unlock" || isUnlockPromptShown) return;
    fail({
      kind: isUnlockingLimited(limitsState)
        ? "lockedLimited"
        : "lockedDeclined",
    });
    // `fail` only sets state; it is not a dependency.
  }, [prompt, isUnlockPromptShown, limitsState]);

  return (
    <>
      <CaptureBox
        isOpen={isOpen}
        text={text}
        onTextChange={setText}
        onSubmit={() => void handleSubmit()}
        onClose={onClose}
        isSubmitting={isSubmitting}
        isProjectNeeded={choice.status === "empty"}
        issue={issue}
        confirmation={confirmation}
        projectChoice={
          <ProjectChoice
            status={choice.status}
            options={choice.options}
            selectedId={selected?.id}
            onSelect={setChosenId}
            errorMessage={choice.errorMessage}
            onRetry={choice.retry}
          />
        }
      />
      {isUnlockPromptShown ? (
        <UnlockModal
          isOpen
          encryptedProjectCount={Math.max(1, encryptedProjectCount)}
          isBusy={isUnlocking}
          errorMessage={unlockError}
          onUnlock={(passphrase) => void submitUnlock(passphrase)}
          onDecline={() => fail({ kind: "lockedDeclined" })}
        />
      ) : null}
      <InboxChoiceDialog
        isOpen={prompt === "choice"}
        onChoose={chooseInbox}
        onCancel={() => fail({ kind: "inboxInTrash" })}
      />
    </>
  );
}

function unlockFailureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Could not unlock this workspace.";
}

interface InboxChoiceDialogProps {
  isOpen: boolean;
  onChoose: (choice: InboxTrashChoice) => void;
  onCancel: () => void;
}

/** Asks whether to restore the Inbox from Trash or make a new one. */
function InboxChoiceDialog({
  isOpen,
  onChoose,
  onCancel,
}: InboxChoiceDialogProps): JSX.Element {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent maxWidth="max-w-[480px]" className="p-6">
        <DialogTitle>{CHOICE_TITLE}</DialogTitle>
        <DialogDescription>{CHOICE_DESCRIPTION}</DialogDescription>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => onChoose("new")}>
            Make a new one
          </Button>
          <Button variant="outline" onClick={() => onChoose("restore")}>
            Restore it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ProjectChoiceProps {
  status: "loading" | "ready" | "empty" | "failed";
  options: CaptureProjectOption[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  errorMessage: string | null;
  onRetry: () => void;
}

function ProjectChoice({
  status,
  options,
  selectedId,
  onSelect,
  errorMessage,
  onRetry,
}: ProjectChoiceProps): JSX.Element | null {
  if (status === "loading") {
    return (
      <p role="status" className="text-sm text-gw-secondary">
        Loading projects…
      </p>
    );
  }
  if (status === "failed") {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-gw-primary">
          {errorMessage}
        </p>
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (status === "empty") return null;
  return (
    <label className="flex flex-col gap-1 text-sm text-gw-secondary">
      Project
      <Select
        value={selectedId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {optionText(o)}
          </option>
        ))}
      </Select>
    </label>
  );
}
