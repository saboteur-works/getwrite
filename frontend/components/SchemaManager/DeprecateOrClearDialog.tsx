"use client";

import React from "react";
import Button from "../common/UI/Button/Button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../common/UI/Dialog";

export type RemoveFieldChoice = "deprecate" | "clear";

export interface DeprecateOrClearDialogProps {
  isOpen: boolean;
  fieldLabel: string;
  onDeprecate: () => void;
  onClear: () => void;
  onCancel: () => void;
}

export default function DeprecateOrClearDialog({
  isOpen,
  fieldLabel,
  onDeprecate,
  onClear,
  onCancel,
}: DeprecateOrClearDialogProps): JSX.Element {
  const [choice, setChoice] = React.useState<RemoveFieldChoice>("deprecate");

  React.useEffect(() => {
    if (isOpen) setChoice("deprecate");
  }, [isOpen]);

  function handleConfirm(): void {
    if (choice === "deprecate") onDeprecate();
    else onClear();
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent maxWidth="max-w-[520px]" className="p-6">
        <DialogTitle>Remove field: {fieldLabel}</DialogTitle>
        <DialogDescription>
          Choose how to handle existing sidecar values for this field.
        </DialogDescription>

        <div className="mt-2 flex flex-col gap-3">
          {/* Deprecate option */}
          <label className="flex cursor-pointer items-start gap-3 rounded border border-gw-border p-3 transition-colors duration-150 hover:border-gw-border-md has-checked:border-gw-border-md has-checked:bg-gw-chrome3">
            <input
              type="radio"
              name="remove-field-choice"
              value="deprecate"
              checked={choice === "deprecate"}
              onChange={() => setChoice("deprecate")}
              className="mt-0.5 shrink-0 accent-current"
            />
            <div>
              <div className="font-mono text-[11px] font-medium uppercase tracking-[0.10em] text-gw-primary">
                Deprecate
              </div>
              <div className="mt-0.5 text-xs text-gw-secondary">
                Keep values in sidecars; hide field from sidebar; mark as
                deprecated in chip UI (queryable but flagged).
              </div>
            </div>
          </label>

          {/* Clear option */}
          <label className="flex cursor-pointer items-start gap-3 rounded border border-gw-border p-3 transition-colors duration-150 hover:border-gw-border-md has-checked:border-gw-border-md has-checked:bg-gw-chrome3">
            <input
              type="radio"
              name="remove-field-choice"
              value="clear"
              checked={choice === "clear"}
              onChange={() => setChoice("clear")}
              className="mt-0.5 shrink-0 accent-current"
            />
            <div>
              <div className="font-mono text-[11px] font-medium uppercase tracking-[0.10em] text-gw-primary">
                Clear
              </div>
              <div className="mt-0.5 text-xs text-gw-secondary">
                Remove the field key from all sidecars (cannot undo). All stored
                values for this field are permanently deleted.
              </div>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={choice === "clear" ? "destructive" : "default"}
            onClick={handleConfirm}
          >
            {choice === "deprecate" ? "Deprecate" : "Clear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
