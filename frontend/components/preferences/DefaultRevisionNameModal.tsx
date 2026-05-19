"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import Button from "../common/UI/Button/Button";

export interface DefaultRevisionNameModalProps {
    initialName: string;
    onClose: () => void;
    onSave: (name: string) => Promise<void>;
}

export default function DefaultRevisionNameModal({
    initialName,
    onClose,
    onSave,
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
            onClose();
        } catch (err) {
            setErrorMessage(
                err instanceof Error ? err.message : "Failed to save.",
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-gw-border pb-5">
                <div>
                    <h2 className="text-2xl font-semibold text-gw-primary">
                        Default Revision Name
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-gw-secondary">
                        The name given to the first saved revision when a new
                        text resource is created.
                    </p>
                </div>
                <Button
                    variant="ghost"
                    onClick={onClose}
                    aria-label="Close"
                    className="shrink-0"
                >
                    <X size={16} aria-hidden="true" />
                </Button>
            </div>

            {/* Input section */}
            <div className="flex flex-col gap-3 rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5">
                <label
                    htmlFor="default-revision-name"
                    className="text-sm font-medium text-gw-primary"
                >
                    Default name
                </label>
                <input
                    id="default-revision-name"
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Initial Draft"
                    maxLength={110}
                    className="w-full rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md"
                />
                <p className="text-right text-xs text-gw-secondary">
                    {draftName.trim().length} / 100
                </p>
            </div>

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
