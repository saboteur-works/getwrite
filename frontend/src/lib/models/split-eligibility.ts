/**
 * @module split-eligibility
 *
 * Pure eligibility decision for Feature 120 FR-2: can a document be split at
 * a text offset, and if not, exactly one stated reason. Used by the client to
 * explain and by the server to enforce. No I/O, no React, no JSX, no JSON, no
 * `node:*`; the document and sidecar are arguments and are never mutated.
 *
 * Offsets follow the stored plain text (`tiptapToPlainText`): the characters
 * of text nodes in document order, plus one newline after each paragraph and
 * heading (wherever nested). Cut points follow
 * `specs/features/split-at-cursor/experiments/task-6.md`.
 *
 * Reading rules, each a decision of this module:
 * - An offset resolves to the first text block whose span `[start, end]`
 *   contains it, so at a code block's end the code block wins over a
 *   following block that starts at the same offset (refused, not guessed).
 * - An offset that is not a whole number, is negative, or lies past the last
 *   text block is `stale-cursor`.
 * - A cursor under a table cell, header or table is `cursor-in-table-cell`
 *   (checked before the code-block rule); in a `codeBlock` it is
 *   `cursor-in-code-block`.
 * - A half is empty when it holds no non-whitespace text and no image. A
 *   block image counts as content of the half it falls in.
 */
import {
  MERGED_MARK_SIDECAR_KEY,
  SPLIT_REFUSAL_REASONS,
  type SplitEligibilityResult,
} from "./split-types";
import type { TipTapNode } from "./types";

/** A document root as stored; only the node shape is read. */
export interface SplitEligibilityDocument {
  type: "doc";
  content: TipTapNode[];
}

/** The sidecar fields read here; `type` is the resource type. */
export type SplitEligibilitySidecar = { type?: unknown } & Record<
  string,
  unknown
>;

/** Everything the decision reads. Defined here because only Task 9 edits `split-types.ts`. */
export interface SplitEligibilityInput {
  /** The canonical document, or null when the resource has none (media, folder). */
  document: SplitEligibilityDocument | null;
  sidecar: SplitEligibilitySidecar;
  /** Plain-text offset of the cursor. */
  offset: number;
}

const TABLE_TYPES: ReadonlySet<string> = new Set([
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
]);
const NEWLINE_TYPES: ReadonlySet<string> = new Set(["paragraph", "heading"]);

/** One text block (or block image) in document order. */
interface WalkItem {
  kind: "text" | "image";
  node: TipTapNode;
  start: number;
  end: number;
  text: string;
  ancestors: readonly string[];
}

function ownText(node: TipTapNode): string {
  let out = "";
  for (const child of node.content ?? []) {
    if (child.type === "text") out += child.text ?? "";
  }
  return out;
}

function hasTextChild(node: TipTapNode): boolean {
  return (node.content ?? []).some((c) => c.type === "text");
}

function isTextBlock(node: TipTapNode): boolean {
  return (
    NEWLINE_TYPES.has(node.type) ||
    node.type === "codeBlock" ||
    hasTextChild(node)
  );
}

/** Walk the document, building items and tracking the running offset. */
function walk(nodes: readonly TipTapNode[]): WalkItem[] {
  const items: WalkItem[] = [];
  let offset = 0;
  const visit = (node: TipTapNode, ancestors: readonly string[]): void => {
    if (node.type === "image") {
      items.push({
        kind: "image",
        node,
        start: offset,
        end: offset,
        text: "",
        ancestors,
      });
      return;
    }
    if (isTextBlock(node)) {
      const text = ownText(node);
      items.push({
        kind: "text",
        node,
        start: offset,
        end: offset + text.length,
        text,
        ancestors,
      });
      offset += text.length + (NEWLINE_TYPES.has(node.type) ? 1 : 0);
      return;
    }
    const next = [...ancestors, node.type];
    for (const child of node.content ?? []) visit(child, next);
  };
  for (const node of nodes) visit(node, []);
  return items;
}

const hasContent = (text: string): boolean => /\S/.test(text);

/**
 * The one named merged-mark predicate (FR-2). Reads the key-name constant of
 * Task 9 by default; Feature 121 defines what is stored under it. False for a
 * sidecar without the key. `key` is a parameter so a test can substitute it.
 */
export function isMergedDocument(
  sidecar: Readonly<Record<string, unknown>>,
  key: string = MERGED_MARK_SIDECAR_KEY,
): boolean {
  const value = sidecar[key];
  return value !== undefined && value !== null;
}

function refuse(
  reason: (typeof SPLIT_REFUSAL_REASONS)[keyof typeof SPLIT_REFUSAL_REASONS],
): SplitEligibilityResult {
  return { eligible: false, reason };
}

/** Refusal that depends only on the kind of document, or null. */
function kindRefusal(
  sidecar: SplitEligibilitySidecar,
): SplitEligibilityResult | null {
  if (sidecar.type === "image" || sidecar.type === "audio")
    return refuse(SPLIT_REFUSAL_REASONS.mediaResource);
  if (sidecar.type === "folder") return refuse(SPLIT_REFUSAL_REASONS.folder);
  if (sidecar.type === "source") return refuse(SPLIT_REFUSAL_REASONS.source);
  const kind = sidecar["entityKind"];
  if (typeof kind === "string" && kind.length > 0)
    return refuse(SPLIT_REFUSAL_REASONS.entityDocument);
  if (isMergedDocument(sidecar))
    return refuse(SPLIT_REFUSAL_REASONS.mergedDocument);
  return null;
}

/** Whether content exists before and after the cursor inside the items. */
function halves(
  items: readonly WalkItem[],
  index: number,
  offset: number,
): { hasBefore: boolean; hasAfter: boolean } {
  let hasBefore = false;
  let hasAfter = false;
  items.forEach((item, i) => {
    if (i === index) {
      const cut = offset - item.start;
      if (hasContent(item.text.slice(0, cut))) hasBefore = true;
      if (hasContent(item.text.slice(cut))) hasAfter = true;
    } else if (item.kind === "image" || hasContent(item.text)) {
      if (i < index) hasBefore = true;
      else hasAfter = true;
    }
  });
  return { hasBefore, hasAfter };
}

/**
 * Decide whether `input.document` can be split at `input.offset`. Returns
 * `{ eligible: true }` or exactly one refusal reason; the first applicable
 * check wins, in the order of the contract: document kind, entity, merged,
 * cursor location, table cell, code block, first half, second half.
 */
export function splitEligibility(
  input: SplitEligibilityInput,
): SplitEligibilityResult {
  const refusal = kindRefusal(input.sidecar);
  if (refusal) return refusal;
  const { document, offset } = input;
  if (document === null || !Number.isInteger(offset) || offset < 0)
    return refuse(SPLIT_REFUSAL_REASONS.staleCursor);

  const items = walk(document.content);
  const index = items.findIndex(
    (item) =>
      item.kind === "text" && item.start <= offset && offset <= item.end,
  );
  if (index === -1) return refuse(SPLIT_REFUSAL_REASONS.staleCursor);

  const at = items[index];
  if (at.ancestors.some((type) => TABLE_TYPES.has(type)))
    return refuse(SPLIT_REFUSAL_REASONS.cursorInTableCell);
  if (at.node.type === "codeBlock")
    return refuse(SPLIT_REFUSAL_REASONS.cursorInCodeBlock);

  const { hasBefore, hasAfter } = halves(items, index, offset);
  if (!hasBefore) return refuse(SPLIT_REFUSAL_REASONS.emptyFirstHalf);
  if (!hasAfter) return refuse(SPLIT_REFUSAL_REASONS.emptySecondHalf);
  return { eligible: true };
}
