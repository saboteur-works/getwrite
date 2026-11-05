import type { Transaction } from "@tiptap/pm/state";
import { ANNOTATION_TRANSACTION_META } from "../../../src/lib/annotation-flows";

/**
 * True when an editor update is an annotation mark change and nothing else
 * (Feature 101, FR-15): at least one transaction carries the annotation meta
 * and every other one is structural: `addToHistory: false`, or the unique-id
 * extension's own transaction (`__uniqueIDTransaction`; measured in a real
 * editor, its appended transaction for a mark change carries that meta and
 * no `addToHistory`). Such an update is saved so the mark persists, but is
 * not an unsaved text change.
 */
export function isAnnotationOnlyUpdate(
  transactions: readonly Transaction[],
): boolean {
  const isAnnotation = (tr: Transaction): boolean =>
    tr.getMeta(ANNOTATION_TRANSACTION_META) === true;
  const isStructural = (tr: Transaction): boolean =>
    tr.getMeta("addToHistory") === false ||
    tr.getMeta("__uniqueIDTransaction") === true;
  return (
    transactions.some(isAnnotation) &&
    transactions.every((tr) => isAnnotation(tr) || isStructural(tr))
  );
}
