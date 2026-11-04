/**
 * @module editorPositionMemory
 *
 * Remembers, for each document, where the writer's cursor was and how far the
 * editor was scrolled, so that coming back to a document in the same session
 * puts them where they left off (`specs/features/editor-position-memory.md`).
 *
 * Held in a module-scoped `Map` only (FR-2): nothing here touches the project,
 * `localStorage`, `sessionStorage` or IndexedDB, so a page reload or an app
 * restart starts with no records. Same synchronous, framework-free shape as
 * `activeEditorRegistry.ts`.
 *
 * `TipTapEditor.tsx` writes and reads it through a key built by
 * {@link editorPositionKey}, which `EditView.tsx` passes as `positionKey`.
 */

/** A recorded ProseMirror selection plus the editor's scroll offset. */
export interface EditorPosition {
  /** ProseMirror selection anchor. */
  anchor: number;
  /** ProseMirror selection head; equal to `anchor` for a collapsed cursor. */
  head: number;
  /** `scrollTop` of the rich editor's scrolling element. */
  scrollTop: number;
}

/** The selection to put into a newly created editor. */
export interface RestoredSelection {
  anchor: number;
  head: number;
}

const positions = new Map<string, EditorPosition>();

/**
 * Builds the record key for one document in one project. `EditView` and the
 * editor both go through this, so they always agree on the key.
 */
export function editorPositionKey(
  projectId: string,
  documentId: string,
): string {
  return `${projectId}:${documentId}`;
}

/** Stores (or replaces) the position recorded for `key`. */
export function recordEditorPosition(
  key: string,
  position: EditorPosition,
): void {
  positions.set(key, { ...position });
}

/** Returns the position recorded for `key`, or `null` when there is none. */
export function getEditorPosition(key: string): EditorPosition | null {
  const position = positions.get(key);
  return position ? { ...position } : null;
}

/**
 * Chooses the selection for a newly created editor (FR-3). With no record it
 * is position 0, as before this feature. With a record, each end is clamped
 * to `0..docSize`, because the text may have got shorter since it was
 * recorded (another device, a revision restore). A value that is not a finite
 * number is treated as 0.
 */
export function resolveRestoredSelection(
  record: Pick<EditorPosition, "anchor" | "head"> | null,
  docSize: number,
): RestoredSelection {
  if (!record) return { anchor: 0, head: 0 };
  const max = Math.max(0, docSize);
  return {
    anchor: clampPosition(record.anchor, max),
    head: clampPosition(record.head, max),
  };
}

function clampPosition(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), max);
}
