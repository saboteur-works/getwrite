"use client";

import React, { useState } from "react";
import type { EditorBodyConfig } from "../../src/lib/editor-body-settings";
import { BODY_FIELD_DEFINITIONS, sanitizeEditorBody } from "../../src/lib/editor-body-settings";
import HeadingStyleField from "./HeadingStyleField";

interface BodySettingsModalProps {
    initialBody?: EditorBodyConfig;
    onClose: () => void;
    onSave: (body: EditorBodyConfig) => Promise<void>;
}

export default function BodySettingsModal({
    initialBody,
    onClose,
    onSave,
}: BodySettingsModalProps): JSX.Element {
    const [draft, setDraft] = useState<EditorBodyConfig>(initialBody ?? {});
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleFieldChange = (
        key: keyof EditorBodyConfig,
        value: string,
    ): void => {
        setDraft((prev) => ({ ...prev, [key]: value }));
    };

    const handleSave = async (): Promise<void> => {
        setIsSaving(true);
        setErrorMessage(null);

        try {
            await onSave(sanitizeEditorBody(draft) ?? {});
            onClose();
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Failed to save body text settings.",
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 lg:px-10">
            <header className="flex items-start justify-between gap-4 border-b border-gw-border pb-5">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-gw-primary">
                        Body Text Styles
                    </h1>
                    <p className="max-w-2xl text-sm text-gw-secondary">
                        Configure default body text typography for this project.
                        These settings apply to all editor body text.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md border border-gw-border bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2"
                >
                    Close
                </button>
            </header>

            <section className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5">
                <div className="grid gap-3 md:grid-cols-2">
                    {BODY_FIELD_DEFINITIONS.map(({ key, label, placeholder }) => (
                        <HeadingStyleField key={key} id={`body-${key}`} label={label}>
                            <input
                                id={`body-${key}`}
                                aria-label={label}
                                value={draft[key] ?? ""}
                                placeholder={placeholder}
                                onChange={(event) =>
                                    handleFieldChange(key, event.target.value)
                                }
                                className="rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md"
                            />
                        </HeadingStyleField>
                    ))}
                </div>
            </section>

            {errorMessage ? (
                <p className="text-sm text-gw-secondary" role="alert">
                    {errorMessage}
                </p>
            ) : null}

            <footer className="flex justify-end gap-3 border-t border-gw-border pt-5">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isSaving}
                    className="rounded-md border border-gw-border bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2 disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                    className="rounded-md border border-gw-border bg-gw-chrome2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gw-primary transition-colors duration-150 hover:bg-gw-chrome disabled:opacity-50"
                >
                    {isSaving ? "Saving…" : "Save"}
                </button>
            </footer>
        </div>
    );
}
