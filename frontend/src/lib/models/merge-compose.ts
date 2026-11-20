/**
 * @module merge-compose
 *
 * Pure tree order and joint composition for "Merge documents" (Feature 121,
 * FR-3). No I/O, no editor, no React, JSX, JSON or `node:*`: reachable from
 * `core.ts`, the CLI and the Electron workers.
 *
 * Order: the absorbed documents are listed depth-first by folder then
 * `orderIndex` (siblings, folders and documents together, as the tree shows
 * them), whatever order they were selected in and wherever the target sits.
 *
 * Composition: the target's own content first and unchanged, then each
 * absorbed text in the order given, with exactly one empty paragraph at each
 * joint and each text kept as stored. An absorbed text that is fully empty (no
 * content, or only paragraphs holding no text or only whitespace) gets no joint
 * and adds nothing. No title, separator or other text is inserted. A target
 * with no content still gets the joint before the first non-empty absorbed text
 * (the joint rule has no exception for the target).
 *
 * Ids (FR-9, `experiments/task-6.md`: an append keeps the absorbed ids, so
 * they would be shared with the absorbed document): every id-bearing node of
 * every appended text, nested ones and each joint paragraph included, gets a
 * fresh id from the id source. `UniqueID` and the editor are not used. An id
 * the source returns that is already used (by the target, by any absorbed
 * text as stored, or already issued) is asked for again; if no unused id comes
 * the composition fails.
 */
import { MERGE_REFUSAL_REASONS } from "./merge-types";
import { ID_BEARING_NODE_TYPES } from "./split-cut";
import type {
  AnyResource,
  TipTapDocument,
  TipTapMark,
  TipTapNode,
} from "./types";
import { generateUUID } from "./uuid";

/** Result of {@link orderAbsorbedDocuments}; a failure never carries ids. */
export type MergeOrderResult =
  | { outcome: "ordered"; ids: string[] }
  | {
      outcome: "failed";
      reason:
        | typeof MERGE_REFUSAL_REASONS.missingDocument
        | typeof MERGE_REFUSAL_REASONS.repeatedId;
      documentId: string;
    };

/** One absorbed document's stored text, already in append order. */
export interface MergeComposeAbsorbed {
  documentId: string;
  document: TipTapDocument;
}

/** Input of {@link composeMergedDocument}. */
export interface MergeComposeInput {
  target: TipTapDocument;
  /** In append order (see {@link orderAbsorbedDocuments}). */
  absorbed: readonly MergeComposeAbsorbed[];
}

/** Why a composition failed; both values are distinct from a composed result. */
export const MERGE_COMPOSE_FAILURES = {
  malformedText: "malformed-text",
  idSourceExhausted: "id-source-exhausted",
} as const;

/** One composition failure reason. */
export type MergeComposeFailureReason =
  (typeof MERGE_COMPOSE_FAILURES)[keyof typeof MERGE_COMPOSE_FAILURES];

/** Result of {@link composeMergedDocument}. */
export type MergeComposeResult =
  | { outcome: "composed"; document: TipTapDocument }
  | {
      outcome: "failed";
      reason: MergeComposeFailureReason;
      /** The document that could not be composed; `null` for the target. */
      documentId: string | null;
    };

/** Options of {@link composeMergedDocument}. */
export interface MergeComposeOptions {
  /** Id source for appended nodes; defaults to `generateUUID`. */
  generateId?: () => string;
}

const ROOT = "root";
const ID_ATTEMPTS = 16;

class IdSourceExhaustedError extends Error {}

function effectiveParentId(resource: AnyResource): string | null {
  if (resource.type === "folder") {
    return resource.parentId ?? resource.folderId ?? null;
  }
  return resource.folderId ?? null;
}

function buildChildrenMap(
  all: readonly AnyResource[],
): Map<string, AnyResource[]> {
  const folderIds = new Set(
    all.filter((r) => r.type === "folder").map((r) => r.id),
  );
  const map = new Map<string, AnyResource[]>();
  for (const r of all) {
    const raw = effectiveParentId(r);
    const parent = raw && raw !== r.id && folderIds.has(raw) ? raw : ROOT;
    const list = map.get(parent);
    if (list) list.push(r);
    else map.set(parent, [r]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  }
  return map;
}

/**
 * The absorbed documents in tree order: depth-first by folder then
 * `orderIndex`. An id twice, or one the tree does not reach, is a failed
 * outcome naming it.
 */
export function orderAbsorbedDocuments(
  absorbedIds: readonly string[],
  all: readonly AnyResource[],
): MergeOrderResult {
  const wanted = new Set<string>();
  for (const id of absorbedIds) {
    if (wanted.has(id)) {
      return {
        outcome: "failed",
        reason: MERGE_REFUSAL_REASONS.repeatedId,
        documentId: id,
      };
    }
    wanted.add(id);
  }
  const map = buildChildrenMap(all);
  const visited = new Set<string>();
  const ids: string[] = [];
  const visit = (parentId: string): void => {
    for (const child of map.get(parentId) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      if (wanted.has(child.id)) ids.push(child.id);
      if (child.type === "folder") visit(child.id);
    }
  };
  visit(ROOT);
  const missing = absorbedIds.find((id) => !ids.includes(id));
  if (missing !== undefined) {
    return {
      outcome: "failed",
      reason: MERGE_REFUSAL_REASONS.missingDocument,
      documentId: missing,
    };
  }
  return { outcome: "ordered", ids };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWellFormedNode(value: unknown): boolean {
  if (!isPlainObject(value) || typeof value.type !== "string") return false;
  if (value.attrs !== undefined && !isPlainObject(value.attrs)) return false;
  if (value.type === "text" && typeof value.text !== "string") return false;
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) return false;
    if (!value.content.every(isWellFormedNode)) return false;
  }
  return true;
}

function isWellFormedDocument(value: unknown): value is TipTapDocument {
  return (
    isPlainObject(value) &&
    value.type === "doc" &&
    Array.isArray(value.content) &&
    value.content.every(isWellFormedNode)
  );
}

/** True for a paragraph holding no text or only whitespace text. */
function isBlankParagraph(node: TipTapNode): boolean {
  if (node.type !== "paragraph") return false;
  return (node.content ?? []).every(
    (child) => child.type === "text" && (child.text ?? "").trim() === "",
  );
}

function isFullyEmpty(document: TipTapDocument): boolean {
  return document.content.every(isBlankParagraph);
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

function copyMarks(marks: TipTapMark[]): TipTapMark[] {
  return marks.map((mark) =>
    mark.attrs ? { ...mark, attrs: { ...mark.attrs } } : { ...mark },
  );
}

/** Deep copy; with `issue`, every id-bearing node gets a fresh id (pre-order). */
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

function failed(
  reason: MergeComposeFailureReason,
  documentId: string | null,
): MergeComposeResult {
  return { outcome: "failed", reason, documentId };
}

/**
 * Compose the target's text followed by each absorbed text, one empty
 * paragraph at each joint, fresh ids on every appended id-bearing node. The
 * inputs are not modified and share no object with the result. Never returns
 * an empty result for a text it cannot compose.
 */
export function composeMergedDocument(
  input: MergeComposeInput,
  options: MergeComposeOptions = {},
): MergeComposeResult {
  if (!isWellFormedDocument(input.target)) {
    return failed(MERGE_COMPOSE_FAILURES.malformedText, null);
  }
  for (const item of input.absorbed) {
    if (!isWellFormedDocument(item.document)) {
      return failed(MERGE_COMPOSE_FAILURES.malformedText, item.documentId);
    }
  }
  const used = new Set<string>();
  collectIds(input.target.content, used);
  for (const item of input.absorbed) collectIds(item.document.content, used);
  const issue = makeIssuer(options.generateId ?? generateUUID, used);

  const content: TipTapNode[] = input.target.content.map((node) =>
    rebuild(node, null),
  );
  let current: string | null = null;
  try {
    for (const item of input.absorbed) {
      if (isFullyEmpty(item.document)) continue;
      current = item.documentId;
      content.push({ type: "paragraph", attrs: { id: issue() } });
      for (const node of item.document.content) {
        content.push(rebuild(node, issue));
      }
    }
  } catch (error) {
    if (error instanceof IdSourceExhaustedError) {
      return failed(MERGE_COMPOSE_FAILURES.idSourceExhausted, current);
    }
    throw error;
  }
  return { outcome: "composed", document: { type: "doc", content } };
}
