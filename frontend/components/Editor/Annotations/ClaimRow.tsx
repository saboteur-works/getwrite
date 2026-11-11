"use client";

/**
 * @module ClaimRow
 *
 * The presentational row of one claim in the annotations panel (Feature 108,
 * FR-6, FR-11, FR-12, FR-13, FR-15). Props in, callbacks out: it reads no
 * store, makes no request and decides nothing the display model
 * (`claim-display.ts`) already decides.
 *
 * - With the claims module on, a claim shows a "Claim" marker, its statement
 *   and saved quote as React text (never HTML), a status select (the four
 *   labels), the date of the last status change and its Source line or the
 *   word "unsourced". Status is never conveyed by colour alone.
 * - The status select is controlled by the stored value: a change is a
 *   callback, so nothing shown changes until the panel writes it
 *   (non-optimistic). A stored status off the list is shown as stored and
 *   marked, and is never rewritten by this component.
 * - The link control is rendered only while `sourcesEnabled`; the Source line,
 *   including "(removed)" and the saved name, stays visible when it is off.
 * - With `moduleEnabled` false the row is an ordinary note: the body is
 *   editable and no marker, status or Source line is shown.
 * - Delete is a callback; a reason string disables it with visible text, as
 *   the note rows do under the `permanentDeletion` limit.
 */
import React from "react";
import Button from "../../common/UI/Button/Button";
import Select from "../../common/UI/Select/Select";
import Textarea from "../../common/UI/Textarea/Textarea";
import {
  deriveClaimDisplay,
  type ClaimDisplayModel,
  type ClaimSourceFacts,
} from "../../../src/lib/claim-display";
import {
  CLAIM_STATUSES,
  CLAIM_STATUS_LABELS,
  type ClaimStatus,
} from "../../../src/lib/models/claim-types";
import { ANNOTATION_LIMITS } from "../../../src/lib/models/annotation-validation";
import { canReattachAnnotation } from "../../../src/lib/models/excerpts";
import type { Annotation } from "../../../src/lib/models/types";

/** The result of a statement or body save; a failure keeps the form open. */
export type ClaimRowSaveResult = { ok: true } | { ok: false; message: string };

export interface ClaimRowProps {
  annotation: Annotation;
  /** The claims module switch; off renders an ordinary note. */
  moduleEnabled: boolean;
  /** The Sources module switch; the link control needs it on. */
  sourcesEnabled: boolean;
  /** The passage has no mark in the open document. */
  isDetached: boolean;
  /** Facts about the Source; absent or "unreadable" reads as not checked. */
  sourceFacts?: ClaimSourceFacts;
  /** The editor has a non-empty selection to re-attach to. */
  hasSelection?: boolean;
  /** The row is the annotation at the caret. */
  isAtCaret?: boolean;
  /** A write is in flight; disables the controls. */
  isBusy?: boolean;
  /** Why Delete is disabled; shown as text beside it. */
  deleteDisabledReason?: string;
  onStatusChange?: (status: ClaimStatus) => void;
  /** Save the statement (claim) or the body (note); the form stays on failure. */
  onSaveStatement?: (text: string) => Promise<ClaimRowSaveResult>;
  /** Open the Source picker; offered only while Sources is on. */
  onRelink?: () => void;
  onReattach?: () => void;
  onShow?: () => void;
  onDelete?: () => void;
}

const SOURCE_NOTE_TEXT = {
  partRemoved: "The attachment or excerpt this points at was removed.",
  unchecked: "The Source could not be checked.",
} as const;

function sourceLabel(model: ClaimDisplayModel, annotation: Annotation): string {
  const name = model.sourceName ?? "name not saved";
  const locator = annotation.target?.locator?.value;
  const where = locator ? ` Location: ${locator}` : "";
  switch (model.sourceState) {
    case "removed":
      return `Source: ${name} (removed)${where}`;
    case "permanently-deleted":
      return `Source: ${name} (permanently deleted)${where}`;
    case "unchecked":
      return `Source: ${name}${where} ${SOURCE_NOTE_TEXT.unchecked}`;
    default:
      return `Source: ${name}${where}${
        model.sourcePartRemoved ? ` ${SOURCE_NOTE_TEXT.partRemoved}` : ""
      }`;
  }
}

function ClaimSourceLine({
  model,
  annotation,
}: {
  model: ClaimDisplayModel;
  annotation: Annotation;
}): JSX.Element {
  if (model.sourceState === "none") {
    return (
      <p data-testid="claim-source" className="text-gw-secondary text-gw-small">
        Source: unsourced
      </p>
    );
  }
  return (
    <p data-testid="claim-source" className="text-gw-secondary text-gw-small">
      {sourceLabel(model, annotation)}
    </p>
  );
}

function StatusControl({
  model,
  selectId,
  isBusy,
  onChange,
}: {
  model: ClaimDisplayModel;
  selectId: string;
  isBusy: boolean;
  onChange?: (status: ClaimStatus) => void;
}): JSX.Element {
  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="text-gw-small text-gw-primary">
          Status
        </label>
        <Select
          id={selectId}
          value={model.statusId}
          disabled={isBusy || onChange === undefined}
          onChange={(e) => {
            const next = e.target.value;
            if ((CLAIM_STATUSES as readonly string[]).includes(next)) {
              onChange?.(next as ClaimStatus);
            }
          }}
        >
          {model.isStatusOffList ? (
            <option value={model.statusId}>
              {model.statusId} (not a listed status)
            </option>
          ) : null}
          {CLAIM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CLAIM_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        {model.statusDate !== undefined ? (
          <span className="text-gw-secondary text-gw-small">
            Status changed {model.statusDate}
          </span>
        ) : null}
      </div>
      {model.isStatusOffList ? (
        <p className="text-gw-secondary text-gw-small">
          &ldquo;{model.statusId}&rdquo; is not a listed status. It is kept as
          stored.
        </p>
      ) : null}
    </div>
  );
}

function StatementForm({
  inputId,
  label,
  saveLabel,
  initial,
  minLength,
  isBusy,
  onSave,
  onCancel,
}: {
  inputId: string;
  label: string;
  saveLabel: string;
  initial: string;
  minLength: number;
  isBusy: boolean;
  onSave: (text: string) => Promise<ClaimRowSaveResult>;
  onCancel: () => void;
}): JSX.Element {
  const [draft, setDraft] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const save = async (): Promise<void> => {
    setIsSaving(true);
    const result = await onSave(draft);
    setIsSaving(false);
    if (result.ok) onCancel();
    else setError(result.message);
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      <label htmlFor={inputId} className="text-gw-small text-gw-primary">
        {label}
      </label>
      <Textarea
        id={inputId}
        value={draft}
        maxLength={ANNOTATION_LIMITS.bodyMax}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
      />
      {error !== null ? (
        <p role="alert" className="text-gw-small text-gw-primary">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={
            isBusy ||
            isSaving ||
            draft.length < minLength ||
            draft.length > ANNOTATION_LIMITS.bodyMax
          }
          onClick={() => void save()}
        >
          {saveLabel}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function ClaimRow({
  annotation,
  moduleEnabled,
  sourcesEnabled,
  isDetached,
  sourceFacts,
  hasSelection = false,
  isAtCaret = false,
  isBusy = false,
  deleteDisabledReason,
  onStatusChange,
  onSaveStatement,
  onRelink,
  onReattach,
  onShow,
  onDelete,
}: ClaimRowProps): JSX.Element {
  const uid = React.useId();
  const [isEditing, setIsEditing] = React.useState(false);
  const display = deriveClaimDisplay(annotation, {
    moduleEnabled,
    sourceFacts,
  });
  const model = display.kind === "claim" ? display : null;
  const noun = model ? "claim" : "note";
  const text = model ? model.statement : annotation.body;
  const bodyId = `${uid}-body`;
  const reasonId = `${uid}-delete-reason`;
  const hasTarget = annotation.target !== undefined;
  // A claim's statement is never empty (FR-8); a note may be, with a target.
  const minLength = model || !hasTarget ? ANNOTATION_LIMITS.bodyMin : 0;
  const isLinkOffered =
    model !== null && sourcesEnabled && onRelink !== undefined;

  return (
    <div
      data-testid={model ? "claim-row" : "annotation-row"}
      data-annotation-id={annotation.id}
      data-detached={isDetached ? "true" : "false"}
      className={`border border-gw-border p-3 ${
        isAtCaret ? "border-l-4 border-l-gw-primary" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {model ? (
          <span className="border border-gw-border px-1.5 font-mono text-gw-nano uppercase tracking-label-wide text-gw-primary">
            Claim
          </span>
        ) : null}
        {isAtCaret ? (
          <span className="font-mono text-gw-nano uppercase tracking-label-wide text-gw-primary">
            At cursor
          </span>
        ) : null}
      </div>
      {annotation.quote ? (
        <p className="text-gw-secondary text-gw-small">
          {isDetached ? "Saved quote: " : "On: "}
          <q>{annotation.quote}</q>
        </p>
      ) : null}
      {model ? <ClaimSourceLine model={model} annotation={annotation} /> : null}
      {model ? (
        <StatusControl
          model={model}
          selectId={`${uid}-status`}
          isBusy={isBusy}
          onChange={onStatusChange}
        />
      ) : null}
      {isEditing && onSaveStatement ? (
        <StatementForm
          inputId={`${uid}-input`}
          label={model ? "Claim statement" : "Note text"}
          saveLabel={model ? "Save statement" : "Save note"}
          initial={text}
          minLength={minLength}
          isBusy={isBusy}
          onSave={onSaveStatement}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <>
          <p
            id={bodyId}
            className="mt-1 whitespace-pre-wrap break-words text-gw-primary"
          >
            {text === "" && hasTarget ? "No note text." : text}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {isDetached ? (
              canReattachAnnotation(annotation) && onReattach ? (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-describedby={bodyId}
                  aria-label={`Re-attach ${noun} to selected text`}
                  disabled={isBusy || !hasSelection}
                  onClick={onReattach}
                >
                  Re-attach
                </Button>
              ) : null
            ) : onShow ? (
              <Button
                variant="secondary"
                size="sm"
                aria-describedby={bodyId}
                aria-label="Show in text"
                onClick={onShow}
              >
                Show in text
              </Button>
            ) : null}
            {onSaveStatement ? (
              <Button
                variant="secondary"
                size="sm"
                aria-describedby={bodyId}
                aria-label={model ? "Edit statement" : "Edit note"}
                disabled={isBusy}
                onClick={() => setIsEditing(true)}
              >
                Edit
              </Button>
            ) : null}
            {isLinkOffered ? (
              <Button
                variant="secondary"
                size="sm"
                aria-describedby={bodyId}
                aria-label={
                  model.sourceState === "none" ? "Link Source" : "Change Source"
                }
                disabled={isBusy}
                onClick={onRelink}
              >
                {model.sourceState === "none" ? "Link Source" : "Change Source"}
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                variant="destructive"
                size="sm"
                aria-label={`Delete ${noun}`}
                aria-describedby={
                  deleteDisabledReason ? `${bodyId} ${reasonId}` : bodyId
                }
                disabled={isBusy || deleteDisabledReason !== undefined}
                onClick={onDelete}
              >
                Delete
              </Button>
            ) : null}
          </div>
          {deleteDisabledReason !== undefined ? (
            <p id={reasonId} className="text-gw-nano text-gw-secondary">
              {deleteDisabledReason}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
