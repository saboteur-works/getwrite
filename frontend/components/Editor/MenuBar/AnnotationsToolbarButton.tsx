import React from "react";
import { MessageSquarePlus, MessageSquareText } from "lucide-react";
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
  /** Whether a non-empty selection allows adding a note now. */
  canAdd?: boolean;
  /** Starts adding a note to the selection; omit to render no add button. */
  onAdd?: () => void;
}

/**
 * Toolbar buttons for annotations (Feature 101, FR-14, FR-12): one opens the
 * annotations panel, the other adds a note to the selected text and is
 * disabled while the selection is empty. Own elements rather than
 * `EditorMenuIcon` because the host needs a ref to return focus to the first,
 * and it reports `aria-expanded`/`aria-controls`.
 */
export default function AnnotationsToolbarButton({
  isOpen,
  onToggle,
  buttonRef,
  panelId,
  canAdd = false,
  onAdd,
}: AnnotationsToolbarControl): JSX.Element {
  return (
    <>
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
      {onAdd ? (
        <button
          type="button"
          data-tooltip-id={TOOLBAR_TOOLTIP_ID}
          data-tooltip-content="Add note to the selected text"
          aria-label="Add note"
          disabled={!canAdd}
          onClick={onAdd}
          className={`editor-menu-icon-button ${buildButtonClasses(false, !canAdd)}`}
        >
          <MessageSquarePlus size={16} />
        </button>
      ) : null}
    </>
  );
}
