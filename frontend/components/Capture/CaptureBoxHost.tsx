"use client";

import React from "react";
import { useStore } from "react-redux";
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
} from "../../src/lib/api/inbox-capture-types";
import { isLimitRefusalError } from "../../src/lib/api/limit-refusal";
import { writeLastCapturedProjectId } from "../../src/lib/capture-preferences";
import { CAPTURE_TEXT_MAX_LENGTH } from "../../src/lib/models/inbox-capture-text";
import { isLockedAccessError } from "../../src/lib/models/crypto/locked-errors";
import { setProject } from "../../src/store/projectsSlice";
import type { RootState } from "../../src/store/store";

export interface CaptureBoxHostProps {
  /** Whether the Capture box is open. */
  isOpen: boolean;
  /** Called when the box should close (Escape, Close, or after a capture). */
  onClose: () => void;
  /** The capture call; defaults to the real client. Tests pass a fake. */
  capture?: (request: CaptureRequest) => Promise<CaptureResult>;
}

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
  if (isLockedAccessError(error)) return lockedProjectIssue();
  if (isLimitRefusalError(error)) return { kind: "pairedRefused" };
  if (error instanceof TypeError) return { kind: "network" };
  const message = error instanceof Error ? error.message : "";
  if (/HTTP 403/.test(message)) return { kind: "pairedRefused" };
  if (/HTTP 404|not found|could not be found/i.test(message)) {
    return { kind: "projectNotFound" };
  }
  return { kind: "server" };
}

/** The unlock flow is not handled here: report the locked project as a failure. */
function lockedProjectIssue(): CaptureBoxIssue {
  return { kind: "lockedDeclined" };
}

/** The Inbox-in-Trash choice is not handled here: report it as a failure. */
function needsChoiceIssue(): CaptureBoxIssue {
  return { kind: "inboxInTrash" };
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
}: CaptureBoxHostProps): JSX.Element {
  const store = useStore<RootState>();
  const choice = useCaptureProjectChoice(isOpen);
  const [text, setText] = React.useState<string>("");
  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const [issue, setIssue] = React.useState<CaptureBoxIssue | undefined>();
  const [confirmation, setConfirmation] = React.useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const inFlight = React.useRef<boolean>(false);
  const wasOpen = React.useRef<boolean>(false);

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
    const stored = store.getState().projects?.projects?.[projectId];
    if (!stored || stored.inboxFolderId === result.inboxFolderId) return;
    store.dispatch(
      setProject({ ...stored, inboxFolderId: result.inboxFolderId }),
    );
  }

  function finishCreated(
    result: CaptureCreated,
    project: CaptureProjectOption,
  ): void {
    writeLastCapturedProjectId(project.id);
    refreshStoredInbox(result, project.id);
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
    if (noticeIssues.length > 0) {
      setIssue(noticeIssues[0]);
      return;
    }
    setIssue(undefined);
    onClose();
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
    try {
      const result = await capture({
        projectId: selected.id,
        text,
        origin: "typed",
      });
      if (result.status === "created") finishCreated(result, selected);
      else if (result.status === "refused") {
        setIssue(refusalIssue(result.notices));
      } else setIssue(needsChoiceIssue());
    } catch (error) {
      setIssue(classifyError(error));
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }

  return (
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
