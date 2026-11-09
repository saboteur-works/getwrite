"use client";

import React from "react";
import Button from "../common/UI/Button/Button";
import Textarea from "../common/UI/Textarea/Textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../common/UI/Dialog";

/**
 * Every outcome the Capture box can show other than success. Each kind has
 * its own message: "failed" and "empty" never share one (FR-17,
 * `docs/standards/failure-visibility.md`).
 */
export type CaptureBoxIssue =
  | { kind: "emptyText" }
  | { kind: "textTooLong"; limit: number }
  | { kind: "projectNotFound" }
  | { kind: "lockedDeclined" }
  | { kind: "lockedLimited" }
  | { kind: "inboxInTrash" }
  | { kind: "seedingNotice" }
  | { kind: "writingLogNotice" }
  | { kind: "network" }
  | { kind: "server" }
  | { kind: "pairedRefused" };

/** How an issue is announced: `alert` for a failure, `status` for a notice. */
export type CaptureBoxIssueSeverity = "alert" | "status";

export interface CaptureBoxIssueView {
  severity: CaptureBoxIssueSeverity;
  message: string;
}

/**
 * Maps an issue to its readable message and the live-region role it needs.
 *
 * The seeding and writing-log notices are `status`: the item was captured and
 * the notice is information. Every other kind means nothing was captured, so
 * it is an `alert`.
 */
export function describeCaptureIssue(
  issue: CaptureBoxIssue,
): CaptureBoxIssueView {
  switch (issue.kind) {
    case "emptyText":
      return {
        severity: "alert",
        message: "Nothing was captured: there is no text to capture.",
      };
    case "textTooLong":
      return {
        severity: "alert",
        message: `Nothing was captured: the text is longer than the ${issue.limit.toLocaleString("en-US")} character limit. Shorten it and try again.`,
      };
    case "projectNotFound":
      return {
        severity: "alert",
        message:
          "Nothing was captured: that project could not be found. Choose another project.",
      };
    case "lockedDeclined":
      return {
        severity: "alert",
        message:
          "Nothing was captured: the project is locked and was not unlocked.",
      };
    case "lockedLimited":
      return {
        severity: "alert",
        message:
          "Nothing was captured: unlocking is not allowed from this device.",
      };
    case "inboxInTrash":
      return {
        severity: "alert",
        message:
          "Nothing was captured yet: this project's Inbox is in Trash. Restore it or make a new one to continue.",
      };
    case "seedingNotice":
      return {
        severity: "status",
        message:
          "Captured, but the item could not be left out of compile. Check its compile setting.",
      };
    case "writingLogNotice":
      return {
        severity: "status",
        message:
          "Captured, but the writing log was not updated, so today's word figures may be low.",
      };
    case "network":
      return {
        severity: "alert",
        message:
          "Nothing was captured: the app could not be reached. Check the connection and try again.",
      };
    case "server":
      return {
        severity: "alert",
        message: "Nothing was captured: the app reported an error. Try again.",
      };
    case "pairedRefused":
      return {
        severity: "alert",
        message:
          "Nothing was captured: this paired device is not allowed to capture.",
      };
  }
}

/** The confirmation announced after a successful capture. */
export function captureConfirmationMessage(projectLabel: string): string {
  return `Captured to ${projectLabel}`;
}

export interface CaptureBoxProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** The text in the box. Controlled, so a failure never loses it. */
  text: string;
  /** Called with the new text on every edit. */
  onTextChange: (text: string) => void;
  /** Called on Enter (not Shift+Enter, not during composition) or on Capture. */
  onSubmit: () => void;
  /** Called on Escape or Close. Never submits. */
  onClose: () => void;
  /** The project choice, filled by the host (a picker). */
  projectChoice?: React.ReactNode;
  /** True when no project can be chosen; capture is disabled and says why. */
  isProjectNeeded?: boolean;
  /** True while a capture request is in flight; further submits are ignored. */
  isSubmitting?: boolean;
  /** The current failure or notice, if any. */
  issue?: CaptureBoxIssue;
  /**
   * Confirmation of a successful capture, announced in a status region that
   * stays mounted after the dialog closes and never takes focus.
   */
  confirmation?: string;
}

const PROJECT_NEEDED_MESSAGE =
  "A project is needed to capture. Create or open a project first.";

/**
 * The Capture box: a labelled dialog with a text area and a project choice.
 *
 * Presentational only: it takes props and fetches nothing. Enter submits,
 * Shift+Enter adds a line, and Enter during IME composition never submits
 * (FR-11). Radix returns focus to the element focused before opening when the
 * dialog closes. The typed text is never stored here; the host owns it.
 */
export default function CaptureBox({
  isOpen,
  text,
  onTextChange,
  onSubmit,
  onClose,
  projectChoice,
  isProjectNeeded = false,
  isSubmitting = false,
  issue,
  confirmation,
}: CaptureBoxProps): JSX.Element {
  const issueView = issue ? describeCaptureIssue(issue) : null;
  const canSubmit = !isSubmitting && !isProjectNeeded;
  const issueId = React.useId();
  const neededId = React.useId();
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const textRef = React.useRef<HTMLTextAreaElement | null>(null);

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  const describedBy =
    [issueView ? issueId : null, isProjectNeeded ? neededId : null]
      .filter((id): id is string => id !== null)
      .join(" ") || undefined;

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          maxWidth="max-w-[560px]"
          className="p-6"
          onOpenAutoFocus={(event) => {
            // Runs before anything in the dialog is focused, so this is the
            // element the writer was on. The Dialog has no Trigger, so Radix
            // would not return focus on its own.
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            event.preventDefault();
            textRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
            returnFocusRef.current = null;
          }}
        >
          <DialogTitle>Capture</DialogTitle>
          <DialogDescription>
            Enter saves the text to the Inbox of the project you choose.
            Shift+Enter adds a new line. Escape closes without saving.
          </DialogDescription>

          <div className="mt-4 flex flex-col gap-3">
            {projectChoice ? <div>{projectChoice}</div> : null}

            <Textarea
              aria-label="Text to capture"
              aria-describedby={describedBy}
              value={text}
              readOnly={isSubmitting}
              disabled={isProjectNeeded}
              rows={6}
              ref={textRef}
              onChange={(event) => onTextChange(event.target.value)}
              onKeyDown={handleKeyDown}
            />

            {isProjectNeeded ? (
              <p id={neededId} className="text-sm text-gw-secondary">
                {PROJECT_NEEDED_MESSAGE}
              </p>
            ) : null}

            <div
              role="alert"
              id={issueView?.severity === "alert" ? issueId : undefined}
              className="text-sm text-gw-primary"
            >
              {issueView?.severity === "alert" ? issueView.message : null}
            </div>
            <div
              role="status"
              id={issueView?.severity === "status" ? issueId : undefined}
              className="text-sm text-gw-primary"
            >
              {issueView?.severity === "status" ? issueView.message : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (canSubmit) onSubmit();
              }}
              disabled={!canSubmit}
            >
              {isSubmitting ? "Capturing…" : "Capture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        role="status"
        data-testid="capture-confirmation"
        className={
          confirmation
            ? "fixed bottom-4 right-4 z-50 border border-gw-border bg-gw-chrome px-3 py-2 text-sm text-gw-primary"
            : undefined
        }
      >
        {confirmation ?? null}
      </div>
    </>
  );
}
