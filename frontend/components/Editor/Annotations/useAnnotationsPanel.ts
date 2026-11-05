"use client";

import React from "react";
import type { AnnotationsToolbarControl } from "../MenuBar/AnnotationsToolbarButton";

/** DOM id of the annotations panel region. */
export const ANNOTATIONS_PANEL_ID = "editor-annotations-panel";

interface AnnotationsPanelController {
  isOpen: boolean;
  /** Closes the panel and returns focus to the toolbar button. */
  close: () => void;
  /** Props for the toolbar button. */
  control: AnnotationsToolbarControl;
}

/**
 * Open state of the annotations panel and the focus return to its opener
 * (Feature 101, FR-14). `resetKey` closes the panel when the document changes.
 */
export function useAnnotationsPanel(
  resetKey: string | undefined,
): AnnotationsPanelController {
  const [isOpen, setIsOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    setIsOpen(false);
  }, [resetKey]);

  const close = React.useCallback(() => {
    setIsOpen(false);
    buttonRef.current?.focus();
  }, []);

  const control: AnnotationsToolbarControl = {
    isOpen,
    onToggle: () => (isOpen ? close() : setIsOpen(true)),
    buttonRef,
    panelId: ANNOTATIONS_PANEL_ID,
  };
  return { isOpen, close, control };
}
