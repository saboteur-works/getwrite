import { useCallback, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import {
  getEditorPosition,
  recordEditorPosition,
} from "./editorPositionMemory";
import { settleCreatedEditor } from "./loadDocumentIntoEditor";

/**
 * Class of the rich editor's scrolling element (`EditorContent`'s wrapper in
 * `TipTapEditor.tsx`; rule in `styles/getwrite-utilities.css`). OQ-1 of
 * `specs/features/editor-position-memory.md`.
 */
const SCROLLER_SELECTOR = ".tiptap-editor-content";

/**
 * Frames to keep trying to put the scroll offset back. The scrolling element
 * may not hold the document yet in the frame after a load, so a restore is
 * retried until `scrollTop` reaches the target or this runs out.
 */
const MAX_SCROLL_RESTORE_FRAMES = 10;

/** What `TipTapEditor` calls at each point a document enters the editor. */
export interface EditorPositionMemory {
  /** Call just before a content-sync load replaces the document. */
  beginLoad: () => void;
  /**
   * Call after a document has entered the editor (in `onCreate`, after
   * migrations, and after a content-sync load). Returns `false`, and does
   * nothing, when position memory is off for this editor (no `positionKey`).
   */
  restore: (editor: Editor) => boolean;
  /** Call from `onSelectionUpdate`. */
  recordSelection: (editor: Editor, transaction: Transaction) => void;
}

function findScroller(editor: Editor): HTMLElement | null {
  const dom = editor.isDestroyed ? null : editor.view?.dom;
  return (dom?.closest?.(SCROLLER_SELECTOR) as HTMLElement | null) ?? null;
}

/**
 * Remembers where the writer was in each document for this session and puts
 * them back there when the document returns (`specs/features/editor-position-memory.md`).
 *
 * A record belongs to the document that is actually in the editor, not to
 * the latest `positionKey` prop: on a document switch the prop can change a
 * render before the new document arrives, so the key is taken at each load
 * (`loadedKeyRef`) and records go to that key until the next load.
 *
 * Loads and restores move the selection in transactions marked
 * `addToHistory: false`; those are never recorded, so a load can't overwrite
 * the record it is about to restore. Any other selection change while a
 * scroll restore is still pending (a mention jump, a click) cancels that
 * restore, so the writer's own move wins (FR-6).
 *
 * @param editor - The live editor, or `null` before it exists.
 * @param positionKey - From `editorPositionKey`; `undefined` turns the
 *   feature off (no record, no restore), as for a non-canonical revision.
 * @param isRichMode - Only the rich editor is recorded (FR-8, OQ-3).
 */
export function useEditorPositionMemory(
  editor: Editor | null,
  positionKey: string | undefined,
  isRichMode: boolean,
): EditorPositionMemory {
  const keyRef = useRef(positionKey);
  keyRef.current = positionKey;
  const isRichModeRef = useRef(isRichMode);
  isRichModeRef.current = isRichMode;
  const loadedKeyRef = useRef<string | undefined>(undefined);
  const restoringRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  const cancelScrollRestore = useCallback(() => {
    if (
      frameRef.current !== null &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = null;
    restoringRef.current = false;
  }, []);

  const record = useCallback((editorInstance: Editor) => {
    const key = loadedKeyRef.current;
    if (!key || !isRichModeRef.current || restoringRef.current) return;
    if (editorInstance.isDestroyed) return;
    const { anchor, head } = editorInstance.state.selection;
    const scrollTop = findScroller(editorInstance)?.scrollTop ?? 0;
    recordEditorPosition(key, { anchor, head, scrollTop });
  }, []);

  const beginLoad = useCallback(() => {
    cancelScrollRestore();
    restoringRef.current = true;
  }, [cancelScrollRestore]);

  const restore = useCallback(
    (editorInstance: Editor): boolean => {
      const key = keyRef.current;
      loadedKeyRef.current = key;
      if (!key) {
        restoringRef.current = false;
        return false;
      }
      cancelScrollRestore();
      restoringRef.current = true;
      const recorded = getEditorPosition(key);
      settleCreatedEditor(editorInstance, recorded);
      const target = recorded?.scrollTop ?? 0;
      if (typeof requestAnimationFrame !== "function") {
        const scroller = findScroller(editorInstance);
        if (scroller) scroller.scrollTop = target;
        restoringRef.current = false;
        return true;
      }
      let framesLeft = MAX_SCROLL_RESTORE_FRAMES;
      const step = () => {
        frameRef.current = null;
        const scroller = findScroller(editorInstance);
        if (scroller) scroller.scrollTop = target;
        framesLeft -= 1;
        const hasReachedTarget =
          scroller !== null && Math.abs(scroller.scrollTop - target) <= 1;
        if (hasReachedTarget || framesLeft <= 0) {
          restoringRef.current = false;
          return;
        }
        frameRef.current = requestAnimationFrame(step);
      };
      frameRef.current = requestAnimationFrame(step);
      return true;
    },
    [cancelScrollRestore],
  );

  const recordSelection = useCallback(
    (editorInstance: Editor, transaction: Transaction) => {
      // Loads and restores: never recorded.
      if (transaction.getMeta("addToHistory") === false) return;
      // The writer (or a mention jump) moved the selection: their move wins
      // over a scroll restore still in progress.
      if (restoringRef.current) cancelScrollRestore();
      record(editorInstance);
    },
    [cancelScrollRestore, record],
  );

  // Scroll offset, recorded as the writer scrolls. The scrolling element is
  // replaced when the editor toggles between rich and source mode.
  useEffect(() => {
    if (!editor || !isRichMode) return;
    const scroller = findScroller(editor);
    if (!scroller) return;
    const onScroll = () => record(editor);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [editor, isRichMode, record]);

  useEffect(() => cancelScrollRestore, [cancelScrollRestore]);

  return { beginLoad, restore, recordSelection };
}
