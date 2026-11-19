"use client";

import React from "react";
import toast from "react-hot-toast";
import { UNDO_TOAST_DISMISS_LABEL } from "../../src/lib/models/split-messages";

/** The two toasts of an Undo: a success or progress report, and the causes of a failure. */
const STATUS_TOAST_ID = "undo-operation-status";
const ALERT_TOAST_ID = "undo-operation-alert";

/** A success report stays up this long, unless dismissed first. A failure stays until it is dismissed. */
const STATUS_TOAST_DURATION_MS = 10000;

const TOAST_BOX =
  "pointer-events-auto flex max-w-md flex-col gap-2 border border-gw-border bg-gw-chrome px-3 py-2 text-sm text-gw-primary";

export interface UndoToastViewProps {
  /** `status` is a success or progress report (`role="status"`); `alert` is a failure or refusal cause (`role="alert"`). */
  kind: "status" | "alert";
  messages: readonly string[];
  /** Called by the Dismiss button. Absent while Undo is still working: nothing to dismiss yet. */
  onDismiss?: () => void;
}

/**
 * The visible body of an Undo toast (Feature 120 Task 32, changed in Feature
 * 121 Task 41 from two fixed regions to dismissable toasts, for both Undo
 * split and Undo merge). A failure or refusal is a `role="alert"` element and
 * a success a `role="status"` element; the Dismiss button is a real button, so
 * the toast is keyboard operable.
 */
export function UndoToastView({
  kind,
  messages,
  onDismiss,
}: UndoToastViewProps): JSX.Element {
  return (
    <div
      role={kind === "alert" ? "alert" : "status"}
      aria-live={kind === "alert" ? "assertive" : "polite"}
      className={TOAST_BOX}
    >
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
      {onDismiss ? (
        <button
          type="button"
          className="self-end text-gw-label underline"
          onClick={onDismiss}
        >
          {UNDO_TOAST_DISMISS_LABEL}
        </button>
      ) : null}
    </div>
  );
}

function show(
  id: string,
  kind: "status" | "alert",
  messages: readonly string[],
  duration: number,
  isDismissable: boolean,
): void {
  toast.custom(
    () => (
      <UndoToastView
        kind={kind}
        messages={messages}
        onDismiss={isDismissable ? () => toast.remove(id) : undefined}
      />
    ),
    { id, duration, position: "bottom-right" },
  );
}

/** Shows (or replaces) the progress report; it has no Dismiss button and stays until replaced. */
export function showUndoWorking(message: string): void {
  show(STATUS_TOAST_ID, "status", [message], Infinity, false);
}

/** Shows (or replaces) a dismissable success report. */
export function showUndoStatus(message: string): void {
  show(STATUS_TOAST_ID, "status", [message], STATUS_TOAST_DURATION_MS, true);
}

/** Shows (or replaces) the dismissable failure texts; they stay until dismissed. */
export function showUndoAlerts(messages: readonly string[]): void {
  show(ALERT_TOAST_ID, "alert", messages, Infinity, true);
}

/** Removes both Undo toasts (a new Undo starts, or the report is empty). */
export function clearUndoToasts(): void {
  toast.remove(STATUS_TOAST_ID);
  toast.remove(ALERT_TOAST_ID);
}

/** Removes the progress toast only. */
export function clearUndoStatus(): void {
  toast.remove(STATUS_TOAST_ID);
}
