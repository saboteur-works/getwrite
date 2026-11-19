"use client";

import React from "react";
import Button from "../common/UI/Button/Button";
import Checkbox from "../common/UI/Checkbox/Checkbox";
import Input from "../common/UI/Input/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../common/UI/Dialog";
import type { SplitPreviewData } from "../../src/lib/api/split";
import { SPLIT_REFUSAL_MESSAGES } from "../../src/lib/models/split-messages";
import type {
  SplitAnnotationKind,
  SplitPreviewAnnotation,
} from "../../src/lib/models/split-preview-core";
import type {
  SplitCarryOverChoice,
  SplitRefusalReason,
} from "../../src/lib/models/split-types";

export interface SplitDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** The server's preview for the cursor; null when the cursor was refused. */
  preview: SplitPreviewData | null;
  /** A refusal known before the split; its text comes from `SPLIT_REFUSAL_MESSAGES`. */
  refusalReason?: SplitRefusalReason;
  /** True while the split request is in flight. */
  isSubmitting?: boolean;
  /** A failure after the split was requested; shown in a `role="alert"` region. */
  failure?: string;
  /** A status after the split; shown in a `role="status"` region. */
  status?: string;
  /** Called with the writer's choice. The dialog sends nothing and stores nothing. */
  onConfirm: (choice: SplitCarryOverChoice) => void;
  /** Called on Cancel or Escape. Never confirms. */
  onClose: () => void;
}

const KIND_ORDER: readonly SplitAnnotationKind[] = [
  "note",
  "citation",
  "claim",
];
const KIND_HEADINGS: Record<SplitAnnotationKind, string> = {
  note: "Notes",
  citation: "Citations",
  claim: "Claims",
};
const NAME_MAX_LENGTH = 1000;

function wordsText(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "word" : "words"}`;
}

function anchoredOfKind(
  preview: SplitPreviewData,
  kind: SplitAnnotationKind,
): SplitPreviewAnnotation[] {
  if (kind === "note") return preview.anchored.notes;
  if (kind === "citation") return preview.anchored.citations;
  return preview.anchored.claims;
}

function Status({ message }: { message?: string }): JSX.Element {
  return (
    <div role="status" className="text-sm text-gw-primary">
      {message ?? null}
    </div>
  );
}

function AnchoredGroup({
  kind,
  items,
  chosen,
  onToggle,
}: {
  kind: SplitAnnotationKind;
  items: SplitPreviewAnnotation[];
  chosen: ReadonlySet<string>;
  onToggle: (id: string) => void;
}): JSX.Element {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="text-sm font-semibold text-gw-primary">
        {KIND_HEADINGS[kind]}
      </h3>
      <ul aria-labelledby={headingId} className="mt-1 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-2 text-sm text-gw-primary">
              <Checkbox
                className="mt-1"
                checked={chosen.has(item.id)}
                onChange={() => onToggle(item.id)}
              />
              <span className="line-clamp-3">{item.body}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SpanningGroup({
  kind,
  items,
}: {
  kind: SplitAnnotationKind;
  items: SplitPreviewAnnotation[];
}): JSX.Element {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId}>
      <h4 id={headingId} className="sr-only">
        {KIND_HEADINGS[kind]} that stay with the original
      </h4>
      <ul aria-labelledby={headingId} className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="line-clamp-3 text-sm text-gw-primary">
            {KIND_HEADINGS[kind].slice(0, -1)}: {item.body}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PreviewSections({
  preview,
  chosenIds,
  chosenFields,
  onToggleId,
  onToggleField,
}: {
  preview: SplitPreviewData;
  chosenIds: ReadonlySet<string>;
  chosenFields: ReadonlySet<string>;
  onToggleId: (id: string) => void;
  onToggleField: (key: string) => void;
}): JSX.Element {
  const fieldsId = React.useId();
  const spanningId = React.useId();
  const hasAnchored = KIND_ORDER.some(
    (k) => anchoredOfKind(preview, k).length > 0,
  );
  return (
    <>
      <ul aria-label="Words in each part" className="text-sm text-gw-primary">
        <li>
          Original document, before the cursor:{" "}
          {wordsText(preview.firstHalfWords)}
        </li>
        <li>
          New document, after the cursor: {wordsText(preview.secondHalfWords)}
        </li>
      </ul>

      {hasAnchored ? (
        KIND_ORDER.map((kind) => {
          const items = anchoredOfKind(preview, kind);
          return items.length > 0 ? (
            <AnchoredGroup
              key={kind}
              kind={kind}
              items={items}
              chosen={chosenIds}
              onToggle={onToggleId}
            />
          ) : null;
        })
      ) : (
        <p className="text-sm text-gw-secondary">
          No notes, citations or claims are in the text that moves.
        </p>
      )}

      {preview.spanning.length > 0 ? (
        <section aria-labelledby={spanningId}>
          <h3 id={spanningId} className="text-sm font-semibold text-gw-primary">
            Stay with the original
          </h3>
          <p className="text-sm text-gw-secondary">
            These span the cursor and stay with the original. Their marked text
            is shortened to the part that remains there.
          </p>
          {KIND_ORDER.map((kind) => {
            const items = preview.spanning.filter((a) => a.kind === kind);
            return items.length > 0 ? (
              <SpanningGroup key={kind} kind={kind} items={items} />
            ) : null;
          })}
        </section>
      ) : null}

      {preview.fields.length > 0 ? (
        <section aria-labelledby={fieldsId}>
          <h3 id={fieldsId} className="text-sm font-semibold text-gw-primary">
            Copy these details to the new document
          </h3>
          <ul aria-label="Details to copy" className="mt-1 flex flex-col gap-1">
            {preview.fields.map((field) => (
              <li key={field.key}>
                <label className="flex items-center gap-2 text-sm text-gw-primary">
                  <Checkbox
                    checked={chosenFields.has(field.key)}
                    onChange={() => onToggleField(field.key)}
                  />
                  <span>{`${field.label} (${field.hasValue ? "has a value" : "no value"})`}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * The form. It lives inside the dialog content, so it mounts fresh on every
 * open: the choices always start at the fixed defaults and are held nowhere
 * else (no storage, no config, no module state).
 */
function SplitForm({
  preview,
  refusalReason,
  isSubmitting,
  failure,
  status,
  nameInputRef,
  onConfirm,
  onClose,
}: Omit<SplitDialogProps, "isOpen"> & {
  nameInputRef: React.RefObject<HTMLInputElement | null>;
}): JSX.Element {
  const nameId = React.useId();
  const nameHelpId = React.useId();
  const [name, setName] = React.useState(preview?.defaultNewName ?? "");
  const [chosenIds, setChosenIds] = React.useState<ReadonlySet<string>>(
    () =>
      new Set(
        preview
          ? KIND_ORDER.flatMap((k) => anchoredOfKind(preview, k)).map(
              (a) => a.id,
            )
          : [],
      ),
  );
  const [chosenFields, setChosenFields] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const trimmed = name.trim();
  const isNameMissing = trimmed.length === 0;
  const canSubmit =
    preview !== null &&
    refusalReason === undefined &&
    !isSubmitting &&
    !isNameMissing;

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (!canSubmit || preview === null) return;
    onConfirm({
      annotationIds: KIND_ORDER.flatMap((k) => anchoredOfKind(preview, k))
        .map((a) => a.id)
        .filter((id) => chosenIds.has(id)),
      fields: preview.fields
        .map((f) => f.key)
        .filter((key) => chosenFields.has(key)),
      newName: trimmed,
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="text-sm text-gw-primary">
          Name of the new document
        </label>
        <Input
          id={nameId}
          ref={nameInputRef}
          value={name}
          maxLength={NAME_MAX_LENGTH}
          aria-describedby={isNameMissing ? nameHelpId : undefined}
          disabled={preview === null}
          onChange={(event) => setName(event.target.value)}
        />
        {isNameMissing && preview !== null ? (
          <p id={nameHelpId} className="text-sm text-gw-secondary">
            A name is needed for the new document.
          </p>
        ) : null}
      </div>

      {preview ? (
        <PreviewSections
          preview={preview}
          chosenIds={chosenIds}
          chosenFields={chosenFields}
          onToggleId={(id) => setChosenIds((s) => toggled(s, id))}
          onToggleField={(key) => setChosenFields((s) => toggled(s, key))}
        />
      ) : null}

      <div role="alert" className="flex flex-col gap-1 text-sm text-gw-primary">
        {refusalReason ? <p>{SPLIT_REFUSAL_MESSAGES[refusalReason]}</p> : null}
        {failure ? <p>{failure}</p> : null}
      </div>
      <Status message={status} />

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="outline" type="submit" disabled={!canSubmit}>
          {isSubmitting ? "Splitting…" : "Split"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The split dialog (Feature 120, FR-12, FR-19): what carries over to the new
 * document, asked every time.
 *
 * Presentational: it takes the preview and callbacks and fetches nothing. It
 * opens with annotations anchored in the moving text ticked and every detail
 * unticked, whatever was chosen before, and stores nothing. Cancel and Escape
 * only call `onClose`. The status region stays mounted outside the dialog
 * while it is closed, so a message after the split is still announced.
 */
export default function SplitDialog({
  isOpen,
  preview,
  refusalReason,
  isSubmitting = false,
  failure,
  status,
  onConfirm,
  onClose,
}: SplitDialogProps): JSX.Element {
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const nameInputRef = React.useRef<HTMLInputElement | null>(null);
  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          maxWidth="max-w-[640px]"
          className="p-6"
          onOpenAutoFocus={(event) => {
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            event.preventDefault();
            nameInputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
            returnFocusRef.current = null;
          }}
        >
          <DialogTitle>Split document</DialogTitle>
          <DialogDescription className="mb-4">
            Choose what goes to the new document. Escape closes without
            splitting.
          </DialogDescription>
          <SplitForm
            preview={preview}
            refusalReason={refusalReason}
            isSubmitting={isSubmitting}
            failure={failure}
            status={status}
            nameInputRef={nameInputRef}
            onConfirm={onConfirm}
            onClose={onClose}
          />
        </DialogContent>
      </Dialog>
      {isOpen ? null : <Status message={status} />}
    </>
  );
}
