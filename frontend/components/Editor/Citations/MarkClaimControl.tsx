"use client";

/**
 * @module MarkClaimControl
 *
 * "Mark as claim" for the open text resource (Feature 108, FR-14). Presentational:
 * the selected passage comes in as `selectionText` and the write goes out
 * through `onMarkClaim` (the type from `claim-types.ts`); the host (Task 25)
 * owns the editor selection, the write and the mark, and decides when the
 * control is rendered at all (module on, writable editor, text resource).
 *
 * It needs no Source list, so it works with the Sources module off; the Source
 * is linked afterwards from the annotations panel.
 *
 * The button stays focusable while unavailable (`aria-disabled`) so the reason
 * can be read. Working, success and failure are text in a status region, never
 * colour alone, and no red is used.
 */
import React from "react";
import type { OnMarkClaim } from "../../../src/lib/models/claim-types";
import Button from "../../common/UI/Button/Button";
import Textarea from "../../common/UI/Textarea/Textarea";

/** Statement bound, in UTF-16 code units, as annotation bodies are counted. */
const STATEMENT_MAX = 5000;

export interface MarkClaimControlProps {
  /** The text currently selected in the editor; blank means no selection. */
  selectionText: string;
  /** Marks the selection as a claim with the given statement. */
  onMarkClaim: OnMarkClaim;
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "";
}

export default function MarkClaimControl({
  selectionText,
  onMarkClaim,
}: MarkClaimControlProps): JSX.Element {
  const [statement, setStatement] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [isBusy, setIsBusy] = React.useState(false);
  const ids = React.useId();
  const reasonId = `${ids}-reason`;
  const hasSelection = selectionText.trim() !== "";
  const isUnavailable = isBusy || !hasSelection;

  const mark = async (): Promise<void> => {
    if (isUnavailable) return;
    if (statement.trim() === "") {
      setStatus("Write the claim statement first.");
      return;
    }
    if (statement.length > STATEMENT_MAX) {
      setStatus(
        `The statement is too long. Keep it to ${STATEMENT_MAX} characters or fewer.`,
      );
      return;
    }
    setIsBusy(true);
    setStatus("Saving the claim.");
    try {
      await onMarkClaim(statement);
      setStatus("Marked as a claim.");
      setStatement("");
    } catch (error: unknown) {
      setStatus(`The claim could not be saved. ${errorText(error)}`.trim());
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      role="group"
      aria-label="Mark a claim"
      className="flex flex-wrap items-end gap-3 border-t border-gw-border p-3"
    >
      <p className="basis-full text-gw-small text-gw-primary">
        Selected passage:{" "}
        {hasSelection ? (
          <q className="whitespace-pre-wrap">{selectionText}</q>
        ) : null}
      </p>
      <label
        className="flex min-w-[16rem] flex-1 flex-col gap-1 text-gw-small text-gw-primary"
        htmlFor={`${ids}-statement`}
      >
        Claim statement
        <Textarea
          id={`${ids}-statement`}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          readOnly={isBusy}
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        aria-disabled={isUnavailable}
        aria-describedby={hasSelection ? undefined : reasonId}
        onClick={() => void mark()}
      >
        Mark as claim
      </Button>
      {hasSelection ? null : (
        <p id={reasonId} className="basis-full text-gw-small text-gw-primary">
          Select the passage you want to mark as a claim.
        </p>
      )}
      <p role="status" className="basis-full text-gw-small text-gw-primary">
        {status}
      </p>
    </div>
  );
}
