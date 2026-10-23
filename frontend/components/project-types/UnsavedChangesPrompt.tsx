"use client";

/**
 * @module UnsavedChangesPrompt
 *
 * Offers Save, Discard and Keep editing when the writer leaves the Project
 * Type Manager (or moves to another item) while an item has unsaved edits.
 *
 * Built on the Radix dialog, so focus moves into the prompt when it opens and
 * returns to the control that was focused before it opened when it closes.
 * Escape and an outside click mean Keep editing.
 */

import Button from "../common/UI/Button/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../common/UI/Dialog";

/** Properties of {@link UnsavedChangesPrompt}. */
export interface UnsavedChangesPromptProps {
  /** Whether the prompt is shown. */
  isOpen: boolean;
  /** Names of the items with unsaved edits, in list order. */
  itemNames: string[];
  /** True while a save is in flight; Save and Discard are disabled. */
  isSaving: boolean;
  /**
   * True where saving is not available (the saved-types store is not
   * configured); Save is turned off and Discard or Keep editing remain.
   */
  isSaveDisabled?: boolean;
  /** Save the item with edits, then carry on with the exit. */
  onSave: () => void;
  /** Drop the edits, then carry on with the exit. */
  onDiscard: () => void;
  /**
   * The control that opened the prompt. Focus goes back to it when the prompt
   * closes (the dialog has no trigger element of its own to return to).
   */
  returnFocusTo: HTMLElement | null;
  /** Stay in the manager with the edits as they are. */
  onKeepEditing: () => void;
}

/**
 * Unsaved-changes prompt.
 *
 * @param props - Component properties.
 * @returns The prompt dialog.
 */
export default function UnsavedChangesPrompt({
  isOpen,
  itemNames,
  isSaving,
  isSaveDisabled = false,
  returnFocusTo,
  onSave,
  onDiscard,
  onKeepEditing,
}: UnsavedChangesPromptProps): JSX.Element {
  const quoted = itemNames.map((name) => `“${name}”`).join(", ");
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onKeepEditing();
      }}
    >
      <DialogContent
        maxWidth="max-w-[480px]"
        className="p-6"
        onKeyDown={(event) => {
          // Escape here means Keep editing (handled by the dialog); it must
          // not bubble through the React tree to the manager behind.
          if (event.key === "Escape") event.stopPropagation();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo?.focus();
        }}
      >
        <DialogTitle>Unsaved changes</DialogTitle>
        <DialogDescription>
          {itemNames.length > 0
            ? `These project types have edits that are not saved: ${quoted}. Save them, discard the edits, or keep editing.`
            : "Some project types have edits that are not saved."}
        </DialogDescription>
        <DialogFooter>
          <Button variant="outline" onClick={onKeepEditing}>
            Keep editing
          </Button>
          <Button variant="secondary" onClick={onDiscard} disabled={isSaving}>
            Discard
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving || isSaveDisabled}
            aria-busy={isSaving}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
