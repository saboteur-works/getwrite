"use client";

import React from "react";
import Button from "../common/UI/Button/Button";
import Select from "../common/UI/Select/Select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../common/UI/Dialog";
import type {
  ShareItem,
  ShareResult,
} from "../../src/lib/api/share-capture-types";
import { classifyShareText } from "../../src/lib/models/share-item-core";
import type { CaptureProjectOption } from "../../src/hooks/useCaptureProjectChoice";

/** Which view the sheet shows: choosing, waiting on the capture, or the outcome. */
export type ShareSheetPhase = "picking" | "pending" | "result";

export interface ShareSheetProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  phase: ShareSheetPhase;
  /** The items of the share, in the order delivered. Shown, never edited. */
  items: ShareItem[];
  /** Read state of the project choice (same values as `CaptureBox`'s host). */
  status: "loading" | "ready" | "empty" | "failed";
  /** Projects offered; every `id` is the on-disk directory id. */
  options: CaptureProjectOption[];
  /** The project selected first, or `null` when there is none. */
  defaultProjectId: string | null;
  /** Readable message for the `failed` status. */
  errorMessage: string | null;
  /** Reads the project list again. */
  onRetry: () => void;
  /** Called once with the chosen project's directory id. */
  onConfirm: (projectId: string) => void;
  /** Called on Cancel or Escape while choosing or capturing. Writes nothing. */
  onCancel: () => void;
  /** Called on Done or Escape in the result view. */
  onDone: () => void;
  /** Shares waiting behind this one; shown in a status region when above zero. */
  queuedCount?: number;
  /** The outcome, shown in the `result` phase. */
  result?: ShareResult;
}

const SUMMARY_MAX_CHARS = 60;
const PROJECT_NEEDED_MESSAGE =
  "A project is needed to capture. Create or open a project first.";

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** One-line summary of an item: text (first line, shortened), link, or image name. */
function summarizeItem(item: ShareItem): string {
  if (item.kind === "image") return `Image: ${item.name}`;
  const classified = classifyShareText(item);
  if (classified.linkOnly) return `Link: ${classified.capturedLink}`;
  const firstLine = item.text.trim().split(/\r?\n/)[0] ?? "";
  const shortened =
    firstLine.length > SUMMARY_MAX_CHARS
      ? `${firstLine.slice(0, SUMMARY_MAX_CHARS)}…`
      : firstLine;
  return `Text: ${shortened}`;
}

function optionText(option: CaptureProjectOption): string {
  if (option.kind !== "locked") return option.label;
  const date = new Date(option.encryptedAt);
  const when = Number.isNaN(date.getTime())
    ? ""
    : ` (encrypted ${date.toLocaleDateString("en-US")})`;
  return `${option.label}${when}`;
}

/**
 * The share sheet: one project choice for the whole share, a cancel control,
 * the number of shares queued behind it, and the single result naming each
 * refused or failed item.
 *
 * Presentational only: props in, callbacks out. The host owns behaviour. The
 * number of resources made is counted from the per-item results, so it cannot
 * disagree with the list shown.
 */
export default function ShareSheet({
  isOpen,
  phase,
  items,
  status,
  options,
  defaultProjectId,
  errorMessage,
  onRetry,
  onConfirm,
  onCancel,
  onDone,
  queuedCount = 0,
  result,
}: ShareSheetProps): JSX.Element {
  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const selectedId =
    chosenId !== null && options.some((o) => o.id === chosenId)
      ? chosenId
      : (defaultProjectId ?? options[0]?.id ?? "");
  const canConfirm = phase === "picking" && status === "ready" && !!selectedId;
  const isResult = phase === "result";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) return;
        if (isResult) onDone();
        else onCancel();
      }}
    >
      <DialogContent maxWidth="max-w-[560px]" className="p-6">
        <DialogTitle>Share to GetWrite</DialogTitle>
        <DialogDescription>
          {isResult
            ? "Here is what happened to each shared item."
            : "Choose a project. Every item is saved to its Inbox. Nothing is saved until you capture."}
        </DialogDescription>

        <div className="mt-4 flex flex-col gap-3">
          {isResult ? (
            <ResultView items={items} result={result} />
          ) : (
            <>
              <p className="text-sm text-gw-primary">
                {items.length} {plural(items.length, "item", "items")} shared
              </p>
              <ul
                aria-label="Items to capture"
                className="flex flex-col gap-1 text-sm text-gw-secondary"
              >
                {items.map((item, index) => (
                  <li key={index} className="truncate">
                    {summarizeItem(item)}
                  </li>
                ))}
              </ul>
              <ProjectPicker
                status={status}
                options={options}
                selectedId={selectedId}
                onSelect={setChosenId}
                errorMessage={errorMessage}
                onRetry={onRetry}
              />
            </>
          )}

          <div role={queuedCount > 0 && !isResult ? "status" : undefined}>
            {queuedCount > 0 && !isResult ? (
              <p className="text-sm text-gw-secondary">
                {queuedCount} more {plural(queuedCount, "share", "shares")}{" "}
                waiting
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          {isResult ? (
            <Button variant="outline" onClick={onDone}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                variant="outline"
                disabled={!canConfirm}
                onClick={() => {
                  if (canConfirm) onConfirm(selectedId);
                }}
              >
                {phase === "pending" ? "Capturing…" : "Capture"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ProjectPickerProps {
  status: ShareSheetProps["status"];
  options: CaptureProjectOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  errorMessage: string | null;
  onRetry: () => void;
}

function ProjectPicker({
  status,
  options,
  selectedId,
  onSelect,
  errorMessage,
  onRetry,
}: ProjectPickerProps): JSX.Element {
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
  if (status === "empty") {
    return (
      <p className="text-sm text-gw-secondary">{PROJECT_NEEDED_MESSAGE}</p>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-sm text-gw-secondary">
      Project
      <Select
        value={selectedId}
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

function ResultView({
  items,
  result,
}: {
  items: ShareItem[];
  result: ShareResult | undefined;
}): JSX.Element {
  const entries = result?.items ?? [];
  const total = entries.length;
  const made = entries.filter((e) => e.status === "captured").length;
  const problems = entries.filter((e) => e.status !== "captured");
  const summary = `${made} of ${total} ${plural(total, "item became a resource.", "items became resources.")}`;
  const role = problems.length > 0 ? "alert" : "status";
  return (
    <div role={role} className="flex flex-col gap-2 text-sm text-gw-primary">
      <p>{summary}</p>
      {problems.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {problems.map((entry) => {
            const item = items[entry.index];
            return (
              <li key={entry.index}>
                <span className="font-medium">
                  {item ? summarizeItem(item) : `Item ${entry.index + 1}`}
                </span>
                {entry.status === "failed" ? " failed: " : " was refused: "}
                {entry.message}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
