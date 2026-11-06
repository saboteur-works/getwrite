"use client";

import { useEffect, useRef, useState } from "react";
import Button from "./UI/Button/Button";
import ConfirmDialog from "./ConfirmDialog";
import type { SaveDefaultsResult } from "./useSaveDefaultsAction";

/**
 * Presentational saved-defaults indicators and save control (Feature 101,
 * FR-5). Shared by `CompilePreviewModal` and `ExportPreviewModal`; it holds no
 * data of its own and calls no transport.
 *
 * Every state is conveyed in words (no colour alone, no red). Failures use
 * `role="alert"`, successes `role="status"`. Clearing asks for confirmation in
 * a dialog; closing it returns focus to the Clear control.
 */

interface LeftOutItem {
  id: string;
  name: string;
  /** True once the writer has ticked it again for this run. */
  isIncludedThisRun: boolean;
}

export interface SavedDefaultsPanelProps {
  /** What the dialog produces, for the copy: "compile" or "export". */
  noun: "compile" | "export";
  readStatus: "loading" | "ok" | "failed";
  /** Reads the saved defaults again after a failure. */
  onRetry: () => void;
  /** Number of resources left out by the default now in effect. */
  savedCount: number;
  /** The resources left out by the default, in saved order. */
  leftOut: LeftOutItem[];
  result: SaveDefaultsResult | null;
  isBusy: boolean;
  /** Save the current selection's exclusions as the project default. */
  onSave: () => void;
  /** Remove the project default. */
  onClear: () => void;
}

export default function SavedDefaultsPanel(
  props: SavedDefaultsPanelProps,
): JSX.Element {
  const {
    noun,
    readStatus,
    onRetry,
    savedCount,
    leftOut,
    result,
    isBusy,
    onSave,
    onClear,
  } = props;
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const clearRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  // The Radix dialog restores focus only to its own trigger, and this one has
  // none, so the panel returns focus itself once the confirmation has closed.
  const [returnFocusTo, setReturnFocusTo] = useState<"clear" | "save" | null>(
    null,
  );
  useEffect(() => {
    if (isConfirmingClear || returnFocusTo === null) return;
    // After a confirmed clear the Clear control is disabled, so focus goes to
    // Save as default instead.
    (returnFocusTo === "clear" ? clearRef : saveRef).current?.focus();
    setReturnFocusTo(null);
  }, [isConfirmingClear, returnFocusTo]);
  const isFailed = readStatus === "failed";
  const isLoading = readStatus === "loading";

  return (
    <section
      aria-label="Project default"
      data-testid="saved-defaults-panel"
      className="mt-3 border-t border-gw-border pt-3"
    >
      {isFailed ? (
        <div role="alert" className="compile-modal-meta-text">
          <p>
            Could not read this project&apos;s saved defaults. They are not
            applied: every resource is selected.
          </p>
          <Button
            variant="secondary"
            size="xs"
            className="mt-1"
            onClick={onRetry}
          >
            Retry
          </Button>
        </div>
      ) : isLoading ? (
        <p role="status" className="compile-modal-meta-text">
          Loading saved defaults…
        </p>
      ) : (
        <>
          <p className="compile-modal-meta-text" data-testid="defaults-count">
            {savedCount === 0
              ? "No project default is saved."
              : `Project default in effect: ${savedCount} resource(s) left out.`}
          </p>
          {leftOut.length > 0 ? (
            <ul
              aria-label="Resources left out by the project default"
              className="compile-modal-meta-text mt-1 list-disc pl-5"
            >
              {leftOut.map((item) => (
                <li key={item.id}>
                  {item.name}
                  {": "}
                  {item.isIncludedThisRun
                    ? "left out by the project default, included for this run."
                    : "left out by the project default. Tick it in the list to include it for this run."}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          ref={saveRef}
          variant="secondary"
          size="xs"
          onClick={onSave}
          disabled={isFailed || isLoading || isBusy}
        >
          Save as default
        </Button>
        <Button
          ref={clearRef}
          variant="secondary"
          size="xs"
          onClick={() => setIsConfirmingClear(true)}
          disabled={isFailed || isLoading || isBusy || savedCount === 0}
        >
          Clear default
        </Button>
      </div>

      {result?.kind === "failed" ? (
        <p role="alert" className="compile-modal-meta-text mt-1">
          Not saved. {result.message}
        </p>
      ) : result ? (
        <p role="status" className="compile-modal-meta-text mt-1">
          {result.kind === "saved"
            ? `Saved. The selection's exclusions are now this project's ${noun} default.`
            : `Cleared. This project has no ${noun} default.`}
        </p>
      ) : null}

      <ConfirmDialog
        isOpen={isConfirmingClear}
        title="Clear the project default?"
        description={`Every resource will be selected the next time you open this ${noun} dialog. Nothing is deleted.`}
        confirmLabel="Clear default"
        onConfirm={() => {
          setIsConfirmingClear(false);
          setReturnFocusTo("save");
          onClear();
        }}
        onCancel={() => {
          setIsConfirmingClear(false);
          setReturnFocusTo("clear");
        }}
      />
    </section>
  );
}
