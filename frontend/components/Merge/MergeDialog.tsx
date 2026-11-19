"use client";

import React from "react";
import Button from "../common/UI/Button/Button";
import Checkbox from "../common/UI/Checkbox/Checkbox";
import Select from "../common/UI/Select/Select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../common/UI/Dialog";
import type { MergePreviewData } from "../../src/lib/api/merge";
import { MERGE_DOCUMENT_CAP } from "../../src/lib/models/merge-limits";
import {
  describeMergeAnnotationLimit,
  describeMergeDocumentCap,
  MERGE_ANNOTATION_LIMIT_MESSAGE,
  MERGE_REFUSAL_MESSAGES,
} from "../../src/lib/models/merge-messages";
import type {
  MergeAnnotationLimitCounts,
  MergeCarryOverChoice,
  MergeFieldChoice,
  MergeRefusalReason,
} from "../../src/lib/models/merge-types";
import { MERGE_REFUSAL_REASONS } from "../../src/lib/models/merge-types";
import type { MetadataValue } from "../../src/lib/models/types";

/** A refusal known before the merge: the reason and, for the annotation limit, the counts. */
export interface MergeDialogRefusal {
  reason: MergeRefusalReason;
  annotationCounts?: MergeAnnotationLimitCounts;
}

export interface MergeDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** The server's preview for the selection; null when the selection was refused. */
  preview: MergePreviewData | null;
  /** A refusal known before the merge; its text comes from `merge-messages.ts`. */
  refusal?: MergeDialogRefusal;
  /** True while the merge request is in flight. */
  isSubmitting?: boolean;
  /** A failure after the merge was requested; shown in a `role="alert"` region. */
  failure?: string;
  /** A status after the merge; shown in a `role="status"` region. */
  status?: string;
  /** Called with the writer's choice. The dialog sends nothing and stores nothing. */
  onConfirm: (choice: MergeCarryOverChoice) => void;
  /** Called on Cancel or Escape. Never confirms. */
  onClose: () => void;
}

type OfferKind = "notes" | "citations" | "claims";
const KINDS: readonly OfferKind[] = ["notes", "citations", "claims"];
const KIND_HEADINGS: Record<OfferKind, string> = {
  notes: "Notes",
  citations: "Citations",
  claims: "Claims",
};

type MetadataOffer = MergePreviewData["metadata"][number];

const INITIAL_FOCUS_SELECTOR =
  "input:not([disabled]), select:not([disabled]), button:not([disabled])";

function wordsText(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "word" : "words"}`;
}

function pathText(path: readonly string[]): string {
  return path.length === 0 ? "At the top level" : `In ${path.join(" / ")}`;
}

function valueText(value: MetadataValue): string {
  if (Array.isArray(value)) return value.map((v) => valueText(v)).join(", ");
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

/** A multiselect holds a list in every document that offers a value. */
function isListField(offer: MetadataOffer): boolean {
  return (
    offer.values.length > 0 && offer.values.every((v) => Array.isArray(v.value))
  );
}

function refusalText(refusal: MergeDialogRefusal): string {
  if (refusal.reason === MERGE_REFUSAL_REASONS.tooManyDocuments)
    return describeMergeDocumentCap(MERGE_DOCUMENT_CAP);
  if (refusal.reason === MERGE_REFUSAL_REASONS.annotationLimit)
    return refusal.annotationCounts
      ? describeMergeAnnotationLimit(refusal.annotationCounts)
      : MERGE_ANNOTATION_LIMIT_MESSAGE;
  return MERGE_REFUSAL_MESSAGES[refusal.reason];
}

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function Status({ message }: { message?: string }): JSX.Element {
  return (
    <div role="status" className="text-sm text-gw-primary">
      {message ?? null}
    </div>
  );
}

function DocumentsList({
  preview,
}: {
  preview: MergePreviewData;
}): JSX.Element {
  return (
    <ol
      aria-label="Documents in the merge"
      className="flex list-none flex-col gap-3 p-0"
    >
      <li className="text-sm text-gw-primary">
        <p className="font-semibold">First document: {preview.target.name}</p>
        <p className="text-gw-secondary">
          {pathText(preview.target.folderPath)}.{" "}
          {wordsText(preview.target.words)}. It receives the text.
        </p>
      </li>
      {preview.absorbed.map((doc, index) => (
        <li key={doc.documentId} className="text-sm text-gw-primary">
          <p className="font-semibold">
            Added no. {index + 2}: {doc.name}
          </p>
          <p className="text-gw-secondary">
            {pathText(doc.folderPath)}. {wordsText(doc.words)}.
          </p>
          <ul
            aria-label={`What happens to ${doc.name}`}
            className="mt-1 list-disc pl-5 text-gw-secondary"
          >
            {doc.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function AnnotationKindList({
  documentName,
  kind,
  items,
  chosen,
  onToggle,
}: {
  documentName: string;
  kind: OfferKind;
  items: { id: string; body: string }[];
  chosen: ReadonlySet<string>;
  onToggle: (id: string) => void;
}): JSX.Element {
  const headingId = React.useId();
  return (
    <div>
      <h4 id={headingId} className="text-sm font-semibold text-gw-primary">
        {KIND_HEADINGS[kind]}
      </h4>
      <ul
        aria-label={`${KIND_HEADINGS[kind]} in ${documentName}`}
        aria-describedby={headingId}
        className="mt-1 flex list-none flex-col gap-1 p-0"
      >
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
    </div>
  );
}

function AnnotationSections({
  preview,
  chosen,
  onToggle,
}: {
  preview: MergePreviewData;
  chosen: ReadonlySet<string>;
  onToggle: (id: string) => void;
}): JSX.Element {
  const nameOf = (id: string): string =>
    preview.absorbed.find((d) => d.documentId === id)?.name ?? "this document";
  const groups = preview.annotations.filter((g) =>
    KINDS.some((k) => g[k].length > 0),
  );
  if (groups.length === 0)
    return (
      <p className="text-sm text-gw-secondary">
        No notes, citations or claims are on the documents that are added.
      </p>
    );
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gw-primary">
        Move these to the first document
      </h3>
      {groups.map((group) => (
        <div key={group.documentId} className="flex flex-col gap-2">
          <h4 className="text-sm text-gw-primary">
            From {nameOf(group.documentId)}
          </h4>
          {KINDS.map((kind) =>
            group[kind].length > 0 ? (
              <AnnotationKindList
                key={kind}
                documentName={nameOf(group.documentId)}
                kind={kind}
                items={group[kind]}
                chosen={chosen}
                onToggle={onToggle}
              />
            ) : null,
          )}
        </div>
      ))}
    </section>
  );
}

function SingleValueField({
  offer,
  names,
  value,
  onChange,
}: {
  offer: MetadataOffer;
  names: ReadonlyMap<string, string>;
  value: string;
  onChange: (documentId: string) => void;
}): JSX.Element {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-gw-primary">
        {offer.field}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Keep the first document&apos;s value</option>
        {offer.values.map((v) => (
          <option key={v.documentId} value={v.documentId}>
            {`${names.get(v.documentId) ?? "A document"}: ${valueText(v.value)}`}
          </option>
        ))}
      </Select>
    </div>
  );
}

function UnitedField({
  offer,
  names,
  chosen,
  onToggle,
}: {
  offer: MetadataOffer;
  names: ReadonlyMap<string, string>;
  chosen: ReadonlySet<string>;
  onToggle: (documentId: string) => void;
}): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm text-gw-primary">
        {offer.field} (values are united with the first document&apos;s)
      </legend>
      {offer.values.map((v) => (
        <label
          key={v.documentId}
          className="flex items-center gap-2 text-sm text-gw-primary"
        >
          <Checkbox
            checked={chosen.has(v.documentId)}
            onChange={() => onToggle(v.documentId)}
          />
          <span>{`${names.get(v.documentId) ?? "A document"}: ${valueText(v.value)}`}</span>
        </label>
      ))}
    </fieldset>
  );
}

interface MetadataChoices {
  /** Field to the one document it takes its value from; absent for none. */
  single: Readonly<Record<string, string>>;
  /** Multiselect field to the documents whose values are united. */
  united: Readonly<Record<string, ReadonlySet<string>>>;
}

function MetadataSection({
  preview,
  choices,
  onSingle,
  onUnited,
}: {
  preview: MergePreviewData;
  choices: MetadataChoices;
  onSingle: (field: string, documentId: string) => void;
  onUnited: (field: string, documentId: string) => void;
}): JSX.Element | null {
  const headingId = React.useId();
  if (preview.metadata.length === 0) return null;
  const names = new Map(preview.absorbed.map((d) => [d.documentId, d.name]));
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-sm font-semibold text-gw-primary">
        Copy these details to the first document
      </h3>
      {preview.metadata.map((offer) =>
        isListField(offer) ? (
          <UnitedField
            key={offer.field}
            offer={offer}
            names={names}
            chosen={choices.united[offer.field] ?? new Set<string>()}
            onToggle={(id) => onUnited(offer.field, id)}
          />
        ) : (
          <SingleValueField
            key={offer.field}
            offer={offer}
            names={names}
            value={choices.single[offer.field] ?? ""}
            onChange={(id) => onSingle(offer.field, id)}
          />
        ),
      )}
    </section>
  );
}

function allAnnotationIds(preview: MergePreviewData): string[] {
  return preview.annotations.flatMap((g) =>
    KINDS.flatMap((k) => g[k].map((a) => a.id)),
  );
}

function buildChoice(
  preview: MergePreviewData,
  chosenIds: ReadonlySet<string>,
  choices: MetadataChoices,
): MergeCarryOverChoice {
  const fields: MergeFieldChoice[] = [];
  const unitedMultiselectFields: string[] = [];
  for (const offer of preview.metadata) {
    if (isListField(offer)) {
      const sources = offer.values
        .map((v) => v.documentId)
        .filter((id) => choices.united[offer.field]?.has(id));
      for (const id of sources)
        fields.push({ field: offer.field, sourceDocumentId: id });
      if (sources.length > 0) unitedMultiselectFields.push(offer.field);
    } else {
      const source = choices.single[offer.field];
      if (source) fields.push({ field: offer.field, sourceDocumentId: source });
    }
  }
  return {
    annotationIds: allAnnotationIds(preview).filter((id) => chosenIds.has(id)),
    fields,
    unitedMultiselectFields,
  };
}

/**
 * The form. It lives inside the dialog content, so it mounts fresh on every
 * open: the choices always start at the fixed defaults and are held nowhere
 * else (no storage, no config, no module state).
 */
function MergeForm({
  preview,
  refusal,
  isSubmitting,
  failure,
  status,
  onConfirm,
  onClose,
}: Omit<MergeDialogProps, "isOpen">): JSX.Element {
  const [chosenIds, setChosenIds] = React.useState<ReadonlySet<string>>(
    () => new Set(preview ? allAnnotationIds(preview) : []),
  );
  const [choices, setChoices] = React.useState<MetadataChoices>({
    single: {},
    united: {},
  });
  const canSubmit = preview !== null && refusal === undefined && !isSubmitting;

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (!canSubmit || preview === null) return;
    onConfirm(buildChoice(preview, chosenIds, choices));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {preview ? (
        <>
          <p className="text-sm text-gw-primary">
            The first document keeps its name, folder and place in the tree. The
            text of the others is added to the end of it, in the order below.
          </p>
          <DocumentsList preview={preview} />
          {preview.warnings.length > 0 ? (
            <ul
              aria-label="Warnings"
              className="flex list-none flex-col gap-1 p-0 text-sm text-gw-primary"
            >
              {preview.warnings.map((w) => (
                <li key={w.kind}>{w.message}</li>
              ))}
            </ul>
          ) : null}
          <AnnotationSections
            preview={preview}
            chosen={chosenIds}
            onToggle={(id) => setChosenIds((s) => toggled(s, id))}
          />
          <MetadataSection
            preview={preview}
            choices={choices}
            onSingle={(field, id) =>
              setChoices((c) => ({
                ...c,
                single: { ...c.single, [field]: id },
              }))
            }
            onUnited={(field, id) =>
              setChoices((c) => ({
                ...c,
                united: {
                  ...c.united,
                  [field]: toggled(c.united[field] ?? new Set<string>(), id),
                },
              }))
            }
          />
        </>
      ) : null}

      <div role="alert" className="flex flex-col gap-1 text-sm text-gw-primary">
        {refusal ? <p>{refusalText(refusal)}</p> : null}
        {failure ? <p>{failure}</p> : null}
      </div>
      <Status message={status} />

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="outline" type="submit" disabled={!canSubmit}>
          {isSubmitting ? "Merging…" : "Merge"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The merge dialog (Feature 121, FR-11, FR-23): what carries over to the first
 * document, asked every time.
 *
 * Presentational: it takes the preview and callbacks and fetches nothing. It
 * opens with every annotation ticked and every metadata choice left at
 * "keep", whatever was chosen before, and stores nothing. Cancel and Escape
 * only call `onClose`. The status region stays mounted outside the dialog
 * while it is closed, so a message after the merge is still announced.
 */
export default function MergeDialog({
  isOpen,
  preview,
  refusal,
  isSubmitting = false,
  failure,
  status,
  onConfirm,
  onClose,
}: MergeDialogProps): JSX.Element {
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          ref={contentRef}
          maxWidth="max-w-[640px]"
          className="p-6"
          onOpenAutoFocus={(event) => {
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            event.preventDefault();
            contentRef.current
              ?.querySelector<HTMLElement>(INITIAL_FOCUS_SELECTOR)
              ?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
            returnFocusRef.current = null;
          }}
        >
          <DialogTitle>Merge documents</DialogTitle>
          <DialogDescription className="mb-4">
            Choose what goes to the first document. Escape closes without
            merging.
          </DialogDescription>
          <MergeForm
            preview={preview}
            refusal={refusal}
            isSubmitting={isSubmitting}
            failure={failure}
            status={status}
            onConfirm={onConfirm}
            onClose={onClose}
          />
        </DialogContent>
      </Dialog>
      {isOpen ? null : <Status message={status} />}
    </>
  );
}
