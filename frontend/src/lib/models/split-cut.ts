/**
 * @module split-cut
 *
 * Pure cut of a stored TipTap document at a plain-text offset (Feature 120,
 * FR-3, text half). No I/O, no editor, no React, JSX, JSON or `node:*`: reachable
 * from `core.ts`, the CLI and the Electron workers.
 *
 * Offset: a character offset into the document's plain text, counted as
 * `tiptapToPlainText` counts it: every text character is one unit and a
 * paragraph or heading adds one unit (its line break) after its content.
 * Valid offsets are `0` to the length of that plain text.
 *
 * Cut points (measured in `experiments/task-6.md`, adapted to a JSON cut):
 * - inside a text run the run is split and both parts keep the run's marks;
 * - inside a paragraph, heading, blockquote or list item the node holding the
 *   cut is split, and every open ancestor (blockquote, list, list item) appears
 *   in both halves;
 * - at a block boundary (the end of a block's text, or just after its line
 *   break) nothing is split and no empty paragraph is created: both offsets give
 *   the same two documents. A block with no text, such as an image, that sits
 *   at the cut goes to the second half;
 * - a cut inside a table (including a cell) or a code block fails with its own
 *   reason; a cut outside them, next to them, is allowed.
 *
 * Ids (Gate 5): every id-bearing node placed in the second half, including the
 * second part of a node that was split, gets a fresh id from the `generateId`
 * argument (default: the v4 `generateUUID`, the same kind of id the editor's
 * `UniqueID` extension makes with `uuid`'s `v4`). The first half keeps its ids.
 * An id source that returns an id already used in the document or already
 * issued is asked again; if it cannot produce an unused id the cut fails.
 *
 * Marks are left as they are in each half; `cutPosition` is the ProseMirror
 * position of the cut in the original document for the annotation step.
 */
import { SPLIT_REFUSAL_REASONS } from "./split-types";
import type { TipTapDocument, TipTapMark, TipTapNode } from "./types";
import { generateUUID } from "./uuid";

/**
 * Node types the editor's `UniqueID` extension gives an id
 * (`components/Editor/editorExtensions.ts`; a test compares the two lists).
 */
export const ID_BEARING_NODE_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "table",
] as const;

/** Why a cut failed; every value is distinct and no failure carries a half. */
export const SPLIT_CUT_FAILURES = {
  offsetOutOfRange: "offset-out-of-range",
  emptyFirstHalf: SPLIT_REFUSAL_REASONS.emptyFirstHalf,
  emptySecondHalf: SPLIT_REFUSAL_REASONS.emptySecondHalf,
  cursorInTableCell: SPLIT_REFUSAL_REASONS.cursorInTableCell,
  cursorInCodeBlock: SPLIT_REFUSAL_REASONS.cursorInCodeBlock,
  idSourceExhausted: "id-source-exhausted",
} as const;

/** One cut failure reason. */
export type SplitCutFailureReason =
  (typeof SPLIT_CUT_FAILURES)[keyof typeof SPLIT_CUT_FAILURES];

/** Result of {@link cutDocument}. */
export type SplitCutResult =
  | {
      outcome: "cut";
      /** Content before the offset; ids unchanged. */
      first: TipTapDocument;
      /** Content after the offset; every id-bearing node has a fresh id. */
      second: TipTapDocument;
      /** ProseMirror position of the cut in the original document. */
      cutPosition: number;
    }
  | { outcome: "failed"; reason: SplitCutFailureReason };

/** Options of {@link cutDocument}. */
export interface SplitCutOptions {
  /** Id source for the second half; defaults to `generateUUID`. */
  generateId?: () => string;
}

const LINE_BLOCKS: ReadonlySet<string> = new Set(["paragraph", "heading"]);
const TABLE_TYPES: ReadonlySet<string> = new Set([
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
]);
const LEAF_TYPES: ReadonlySet<string> = new Set([
  "image",
  "hardBreak",
  "horizontalRule",
]);
const ID_ATTEMPTS = 16;

interface CutContext {
  target: number;
  /** Straddled nodes that appear in both halves (each adds a closing token to the first half). */
  open: number;
  failure: SplitCutFailureReason | null;
}

interface NodePair {
  before: TipTapNode | null;
  after: TipTapNode | null;
}

class IdSourceExhaustedError extends Error {}

/** Plain-text length of a node, counting a line break after a paragraph or heading. */
function textLength(node: TipTapNode): number {
  if (node.type === "text") return node.text?.length ?? 0;
  let total = LINE_BLOCKS.has(node.type) ? 1 : 0;
  for (const child of node.content ?? []) total += textLength(child);
  return total;
}

/** Plain text of a document, as `tiptapToPlainText` builds it. */
function plainText(nodes: readonly TipTapNode[]): string {
  const walk = (node: TipTapNode): string => {
    let out = node.text ?? "";
    for (const child of node.content ?? []) out += walk(child);
    return LINE_BLOCKS.has(node.type) ? `${out}\n` : out;
  };
  return nodes.map(walk).join("").replace(/\n+$/g, "");
}

type Placement = "before" | "after" | "straddle";

/** Where the cut falls relative to a node that starts at `start`. */
function place(node: TipTapNode, start: number, target: number): Placement {
  if (target <= start) return "after";
  const length = textLength(node);
  if (node.type === "text")
    return target >= start + length ? "before" : "straddle";
  if (LINE_BLOCKS.has(node.type)) {
    // The end of the text (before the line break) already counts as the end of the block.
    return target >= start + length - 1 ? "before" : "straddle";
  }
  if (length === 0) return "before";
  return target >= start + length ? "before" : "straddle";
}

function copyMarks(marks: TipTapMark[]): TipTapMark[] {
  return marks.map((mark) =>
    mark.attrs ? { ...mark, attrs: { ...mark.attrs } } : { ...mark },
  );
}

function splitText(node: TipTapNode, start: number, target: number): NodePair {
  const value = node.text ?? "";
  const at = target - start;
  const part = (text: string): TipTapNode => ({
    ...node,
    text,
    ...(node.marks ? { marks: copyMarks(node.marks) } : {}),
  });
  return { before: part(value.slice(0, at)), after: part(value.slice(at)) };
}

function straddle(node: TipTapNode, start: number, ctx: CutContext): NodePair {
  if (TABLE_TYPES.has(node.type)) {
    ctx.failure = SPLIT_CUT_FAILURES.cursorInTableCell;
    return { before: null, after: null };
  }
  if (node.type === "codeBlock") {
    ctx.failure = SPLIT_CUT_FAILURES.cursorInCodeBlock;
    return { before: null, after: null };
  }
  if (node.type === "text") return splitText(node, start, ctx.target);
  const parts = cutChildren(node.content ?? [], start, ctx);
  const wrap = (content: TipTapNode[]): TipTapNode | null =>
    content.length === 0
      ? null
      : {
          ...node,
          ...(node.attrs ? { attrs: { ...node.attrs } } : {}),
          content,
        };
  const before = wrap(parts.before);
  const after = wrap(parts.after);
  if (before && after) ctx.open += 1;
  return { before, after };
}

function cutChildren(
  children: readonly TipTapNode[],
  start: number,
  ctx: CutContext,
): { before: TipTapNode[]; after: TipTapNode[] } {
  const before: TipTapNode[] = [];
  const after: TipTapNode[] = [];
  let at = start;
  for (const child of children) {
    const where = place(child, at, ctx.target);
    if (where === "before") before.push(child);
    else if (where === "after") after.push(child);
    else {
      const pair = straddle(child, at, ctx);
      if (pair.before) before.push(pair.before);
      if (pair.after) after.push(pair.after);
    }
    at += textLength(child);
  }
  return { before, after };
}

/** ProseMirror size of a node as the editor schema counts it. */
function nodeSize(node: TipTapNode): number {
  if (node.type === "text") return node.text?.length ?? 0;
  if (LEAF_TYPES.has(node.type)) return 1;
  let total = 2;
  for (const child of node.content ?? []) total += nodeSize(child);
  return total;
}

/** True when a half holds non-whitespace text or an image. */
function hasContent(nodes: readonly TipTapNode[]): boolean {
  const walk = (node: TipTapNode): boolean => {
    if (node.type === "image") return true;
    if (node.type === "text") return (node.text ?? "").trim() !== "";
    return (node.content ?? []).some(walk);
  };
  return nodes.some(walk);
}

function isIdBearing(node: TipTapNode): boolean {
  if ((ID_BEARING_NODE_TYPES as readonly string[]).includes(node.type))
    return true;
  const id = node.attrs?.id;
  return id !== undefined && id !== null;
}

function collectIds(nodes: readonly TipTapNode[], into: Set<string>): void {
  for (const node of nodes) {
    const id = node.attrs?.id;
    if (typeof id === "string") into.add(id);
    collectIds(node.content ?? [], into);
  }
}

/**
 * Deep copy of a node; with `issue`, every id-bearing node gets the id it
 * returns (pre-order, so a parent is numbered before its children).
 */
function rebuild(node: TipTapNode, issue: (() => string) | null): TipTapNode {
  const copy: TipTapNode = { ...node };
  if (node.attrs) copy.attrs = { ...node.attrs };
  if (node.marks) copy.marks = copyMarks(node.marks);
  if (issue && isIdBearing(node))
    copy.attrs = { ...(copy.attrs ?? {}), id: issue() };
  if (node.content)
    copy.content = node.content.map((child) => rebuild(child, issue));
  return copy;
}

function makeIssuer(generateId: () => string, used: Set<string>): () => string {
  return () => {
    for (let attempt = 0; attempt < ID_ATTEMPTS; attempt++) {
      const id = generateId();
      if (typeof id === "string" && id !== "" && !used.has(id)) {
        used.add(id);
        return id;
      }
    }
    throw new IdSourceExhaustedError("no unused id");
  };
}

function failed(reason: SplitCutFailureReason): SplitCutResult {
  return { outcome: "failed", reason };
}

/**
 * Cut `doc` at plain-text `offset` into two documents. Never returns an empty
 * half: a whitespace-only half (no image) is a failed outcome. The input is not
 * modified and shares no object with either half.
 */
export function cutDocument(
  doc: TipTapDocument,
  offset: number,
  options: SplitCutOptions = {},
): SplitCutResult {
  if (!Number.isInteger(offset) || offset < 0) {
    return failed(SPLIT_CUT_FAILURES.offsetOutOfRange);
  }
  if (offset > plainText(doc.content).length) {
    return failed(SPLIT_CUT_FAILURES.offsetOutOfRange);
  }
  const ctx: CutContext = { target: offset, open: 0, failure: null };
  const parts = cutChildren(doc.content, 0, ctx);
  if (ctx.failure) return failed(ctx.failure);
  if (!hasContent(parts.before))
    return failed(SPLIT_CUT_FAILURES.emptyFirstHalf);
  if (!hasContent(parts.after))
    return failed(SPLIT_CUT_FAILURES.emptySecondHalf);

  const used = new Set<string>();
  collectIds(doc.content, used);
  const issue = makeIssuer(options.generateId ?? generateUUID, used);
  try {
    const first: TipTapDocument = {
      type: "doc",
      content: parts.before.map((node) => rebuild(node, null)),
    };
    const second: TipTapDocument = {
      type: "doc",
      content: parts.after.map((node) => rebuild(node, issue)),
    };
    const size = first.content.reduce((sum, node) => sum + nodeSize(node), 0);
    return { outcome: "cut", first, second, cutPosition: size - ctx.open };
  } catch (error) {
    if (error instanceof IdSourceExhaustedError) {
      return failed(SPLIT_CUT_FAILURES.idSourceExhausted);
    }
    throw error;
  }
}
