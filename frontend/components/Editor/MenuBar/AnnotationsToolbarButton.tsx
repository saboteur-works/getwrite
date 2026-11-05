import React from "react";
import { MessageSquareText } from "lucide-react";
import { TOOLBAR_TOOLTIP_ID, buildButtonClasses } from "./editor-toolbar-icons";

export interface AnnotationsToolbarControl {
  /** Whether the annotations panel is open. */
  isOpen: boolean;
  /** Opens or closes the panel. */
  onToggle: () => void;
  /** Ref to the button, so the host can return focus to it on close. */
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  /** DOM id of the panel region this button controls. */
  panelId: string;
}

/**
 * Toolbar button that opens the annotations panel (Feature 101, FR-14).
 * Its own element rather than `EditorMenuIcon` because the host needs a ref
 * to return focus to it, and it reports `aria-expanded`/`aria-controls`.
 */
export default function AnnotationsToolbarButton({
  isOpen,
  onToggle,
  buttonRef,
  panelId,
}: AnnotationsToolbarControl): JSX.Element {
  return (
    <button
      ref={buttonRef}
      type="button"
      data-tooltip-id={TOOLBAR_TOOLTIP_ID}
      data-tooltip-content="Annotations"
      aria-label="Annotations"
      aria-expanded={isOpen}
      aria-controls={panelId}
      onClick={onToggle}
      className={`editor-menu-icon-button ${buildButtonClasses(isOpen)}`}
    >
      <MessageSquareText size={16} />
    </button>
  );
}
