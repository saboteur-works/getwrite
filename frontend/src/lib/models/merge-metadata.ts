/**
 * @module merge-metadata
 *
 * The pure metadata carry of "Merge documents" (Feature 121, FR-10): which
 * metadata values travel from the absorbed documents to the target.
 *
 * A merge changes none of the target's values except its text and annotations
 * unless the writer chooses it. This module therefore decides only the
 * target's `userMetadata` (status, point of view and every custom field live
 * there) and returns nothing else: the target's name, resource subtype,
 * `wordCountGoal`, compile exclusion, folder and position are not in the
 * result, so they cannot change. The result is built from named keys, never as
 * a spread of one sidecar over another (the carry rules of
 * `split-new-document.ts`). An absorbed document is only read.
 *
 * Each chosen field takes its value from none or exactly one absorbed
 * document, except a multiselect named in `unitedMultiselectFields`, whose
 * values from every chosen source are united with the target's own, without
 * duplicates. A value not carried is left as the target holds it, or absent;
 * nothing is invented. Metadata choices start unticked
 * ({@link defaultMergeMetadataChoice}).
 *
 * No React, JSX, JSON, `node:*` or I/O.
 */
import type { MergeCarryOverChoice } from "./merge-types";
import type { MetadataValue } from "./types";

/** The metadata part of a {@link MergeCarryOverChoice}. */
export type MergeMetadataChoice = Pick<
  MergeCarryOverChoice,
  "fields" | "unitedMultiselectFields"
>;

/** An absorbed document as the carry reads it. */
export interface MergeMetadataSource {
  documentId: string;
  userMetadata: Readonly<Record<string, MetadataValue>>;
}

/** One absorbed document's value for an offered field. */
export interface MergeMetadataOfferValue {
  documentId: string;
  value: MetadataValue;
}

/** A field the dialog offers, with every source document's value. */
export interface MergeMetadataOffer {
  field: string;
  values: MergeMetadataOfferValue[];
}

/** Why a carry was refused; no value is written for a refusal. */
export type MergeMetadataCarryRefusal =
  | "repeated-field"
  | "unknown-source"
  | "not-a-list";

/** Result of {@link applyMergeMetadataCarry}. */
export type MergeMetadataCarryResult =
  | { ok: true; userMetadata: Record<string, MetadataValue> }
  | { ok: false; reason: MergeMetadataCarryRefusal; field: string };

/** The fixed default: no field ticked, nothing united (OQ-7). */
export function defaultMergeMetadataChoice(): MergeMetadataChoice {
  return { fields: [], unitedMultiselectFields: [] };
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** A value counts as held unless it is absent, null, blank text or an empty list. */
function holdsValue(value: MetadataValue | undefined): value is MetadataValue {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function setOwn(
  into: Record<string, MetadataValue>,
  key: string,
  value: MetadataValue,
): void {
  // defineProperty so a field named like an Object.prototype member stays data.
  Object.defineProperty(into, key, {
    value: structuredClone(value),
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * The fields to offer: those holding a value in some absorbed document, in
 * order of first appearance, each with the values of the documents that hold
 * one.
 */
export function offerMergeMetadataFields(
  absorbed: readonly MergeMetadataSource[],
): MergeMetadataOffer[] {
  const offers: MergeMetadataOffer[] = [];
  for (const doc of absorbed) {
    for (const field of Object.keys(doc.userMetadata)) {
      const value = doc.userMetadata[field];
      if (!holdsValue(value)) continue;
      let offer = offers.find((o) => o.field === field);
      if (offer === undefined) {
        offer = { field, values: [] };
        offers.push(offer);
      }
      offer.values.push({
        documentId: doc.documentId,
        value: structuredClone(value),
      });
    }
  }
  return offers;
}

function sameValue(a: MetadataValue, b: MetadataValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Appends the items of `more` that `list` does not hold yet. */
function unite(list: MetadataValue[], more: readonly MetadataValue[]): void {
  for (const item of more) {
    if (!list.some((held) => sameValue(held, item))) {
      list.push(structuredClone(item));
    }
  }
}

function listOf(value: MetadataValue | undefined): MetadataValue[] | null {
  return Array.isArray(value) ? (value as MetadataValue[]) : null;
}

/**
 * Computes the target's `userMetadata` after the carry. Returns a new object
 * that shares nothing with its inputs; the target and the absorbed documents
 * are not modified. A refusal names the field and writes nothing.
 */
export function applyMergeMetadataCarry(
  targetUserMetadata: Readonly<Record<string, MetadataValue>>,
  absorbed: readonly MergeMetadataSource[],
  choice: MergeMetadataChoice,
): MergeMetadataCarryResult {
  const result: Record<string, MetadataValue> = {};
  for (const key of Object.keys(targetUserMetadata)) {
    setOwn(result, key, targetUserMetadata[key]);
  }
  const united = new Set(choice.unitedMultiselectFields);
  const seen = new Set<string>();
  for (const { field, sourceDocumentId } of choice.fields) {
    if (united.has(field) === false) {
      if (seen.has(field)) {
        return { ok: false, reason: "repeated-field", field };
      }
    }
    seen.add(field);
    if (sourceDocumentId === null) continue;
    const source = absorbed.find((d) => d.documentId === sourceDocumentId);
    if (source === undefined) {
      return { ok: false, reason: "unknown-source", field };
    }
    if (!hasOwn(source.userMetadata, field)) continue;
    const value = source.userMetadata[field];
    if (!holdsValue(value)) continue;
    if (united.has(field)) {
      const incoming = listOf(value);
      const own = hasOwn(result, field) ? result[field] : undefined;
      const existing = own === undefined ? [] : listOf(own);
      if (incoming === null || existing === null) {
        return { ok: false, reason: "not-a-list", field };
      }
      const merged = [...existing];
      unite(merged, incoming);
      setOwn(result, field, merged as MetadataValue);
    } else {
      setOwn(result, field, value);
    }
  }
  return { ok: true, userMetadata: result };
}
