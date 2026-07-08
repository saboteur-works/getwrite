"use client";

import React, { useState } from "react";
import Button from "../common/UI/Button/Button";
import Card from "../common/UI/Card/Card";
import Input from "../common/UI/Input/Input";

export interface DefaultRevisionNameModalProps {
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  /**
   * Whether a successful save should also close the dialog. Defaults to
   * `true` for standalone usage. The consolidated Project Settings dialog
   * passes `false` so saving one section doesn't dismiss the whole surface.
   */
  closeOnSave?: boolean;
}

export default function DefaultRevisionNameModal({
  initialName,
  onClose,
  onSave,
  closeOnSave = true,
}: DefaultRevisionNameModalProps): JSX.Element {
  const [draftName, setDraftName] = useState<string>(initialName);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setErrorMessage("Name cannot be empty.");
      return;
    }
    if (trimmed.length > 100) {
      setErrorMessage("Name must be 100 characters or fewer.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onSave(trimmed);
      if (closeOnSave) {
        onClose();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-1 border-b border-gw-border pb-4">
        <h2 className="text-lg font-semibold text-gw-primary">
          Default Revision Name
        </h2>
        <p className="max-w-2xl text-sm text-gw-secondary">
          The name given to the first saved revision when a new text resource is
          created.
        </p>
      </header>

      {/* Input section */}
      <Card padding="lg" className="flex flex-col gap-3">
        <label
          htmlFor="default-revision-name"
          className="text-sm font-medium text-gw-primary"
        >
          Default name
        </label>
        <Input
          id="default-revision-name"
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Initial Draft"
          maxLength={110}
          className="w-full"
        />
        <p className="text-right text-xs text-gw-secondary">
          {draftName.trim().length} / 100
        </p>
      </Card>

      {/* Error */}
      {errorMessage ? (
        <p className="text-sm text-gw-red" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {/* Footer */}
      <div className="flex justify-end gap-3 border-t border-gw-border pt-5">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
