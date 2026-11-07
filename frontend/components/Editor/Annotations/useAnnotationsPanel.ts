"use client";

import React from "react";
import type { Editor } from "@tiptap/core";
import type { AnnotationsToolbarControl } from "../MenuBar/AnnotationsToolbarButton";

/** DOM id of the annotations panel region. */
export const ANNOTATIONS_PANEL_ID = "editor-annotations-panel";

/** The selection captured when the writer chose "Add note". */
export interface PendingAnnotationAdd {
  from: number;
  to: number;
  /** The selected text at that moment (becomes the annotation's quote). */
  quote: string;
}

interface AnnotationsPanelController {
  isOpen: boolean;
  /** Set between choosing "Add note" and saving or cancelling the form. */
  pendingAdd: PendingAnnotationAdd | null;
  /** Ends the add form (saved or cancelled). */
  clearAdd: () => void;
  /** Closes the panel and returns focus to the toolbar button. */
  close: () => void;
  /** Props for the toolbar button. */
  control: AnnotationsToolbarControl;
}

/**
 * Open state of the annotations panel and the focus return to its opener
 * (Feature 101, FR-14), plus the add control (FR-12): `canAdd` follows a
 * non-empty selection in an editable editor, and `onAdd` captures that
 * selection and opens the panel's add form. `resetKey` closes the panel and
 * drops a pending add when the document changes.
 */
export function useAnnotationsPanel(
  resetKey: string | undefined,
  editor: Editor | null = null,
): AnnotationsPanelController {
  const [isOpen, setIsOpen] = React.useState(false);
  const [pendingAdd, setPendingAdd] =
    React.useState<PendingAnnotationAdd | null>(null);
  const [canAdd, setCanAdd] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    setIsOpen(false);
    setPendingAdd(null);
  }, [resetKey]);

  React.useEffect(() => {
    if (!editor) {
      setCanAdd(false);
      return;
    }
    const update = (): void =>
      setCanAdd(editor.isEditable && !editor.state.selection.empty);
    update();
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

  const onAdd = React.useCallback(() => {
    if (!editor || editor.state.selection.empty) return;
    const { from, to } = editor.state.selection;
    setPendingAdd({
      from,
      to,
      quote: editor.state.doc.textBetween(from, to, "\n"),
    });
    setIsOpen(true);
  }, [editor]);

  const clearAdd = React.useCallback(() => setPendingAdd(null), []);

  const close = React.useCallback(() => {
    setIsOpen(false);
    setPendingAdd(null);
    buttonRef.current?.focus();
  }, []);

  const control: AnnotationsToolbarControl = {
    isOpen,
    onToggle: () => (isOpen ? close() : setIsOpen(true)),
    buttonRef,
    panelId: ANNOTATIONS_PANEL_ID,
    canAdd,
    onAdd: editor ? onAdd : undefined,
  };
  return { isOpen, pendingAdd, clearAdd, close, control };
}
