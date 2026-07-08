"use client";

import React, { useState } from "react";
import type { EditorBodyConfig } from "../../src/lib/editor-body-settings";
import {
  BODY_FIELD_DEFINITIONS,
  sanitizeEditorBody,
} from "../../src/lib/editor-body-settings";
import HeadingStyleField from "./HeadingStyleField";
import FontFamilyInput from "./FontFamilyInput";
import Button from "../common/UI/Button/Button";
import Card from "../common/UI/Card/Card";
import Input from "../common/UI/Input/Input";

interface BodySettingsModalProps {
  initialBody?: EditorBodyConfig;
  onClose: () => void;
  onSave: (body: EditorBodyConfig) => Promise<void>;
  /**
   * Whether a successful save should also close the dialog. Defaults to
   * `true` for standalone usage. The consolidated Project Settings dialog
   * passes `false` so saving one section doesn't dismiss the whole surface.
   */
  closeOnSave?: boolean;
}

export default function BodySettingsModal({
  initialBody,
  onClose,
  onSave,
  closeOnSave = true,
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
      if (closeOnSave) {
        onClose();
      }
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
            Configure default body text typography for this project. These
            settings apply to all editor body text.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </header>

      <Card as="section" padding="lg">
        <div className="grid gap-3 md:grid-cols-2">
          {BODY_FIELD_DEFINITIONS.map(({ key, label, placeholder }) => (
            <HeadingStyleField key={key} id={`body-${key}`} label={label}>
              {key === "fontFamily" ? (
                <FontFamilyInput
                  id={`body-${key}`}
                  aria-label={label}
                  value={draft[key] ?? ""}
                  placeholder={placeholder}
                  onChange={(event) =>
                    handleFieldChange(key, event.target.value)
                  }
                />
              ) : (
                <Input
                  id={`body-${key}`}
                  aria-label={label}
                  value={draft[key] ?? ""}
                  placeholder={placeholder}
                  onChange={(event) =>
                    handleFieldChange(key, event.target.value)
                  }
                />
              )}
            </HeadingStyleField>
          ))}

          <div className="mt-4 border-t border-gw-border pt-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary">
              Preview
            </span>
            <p
              aria-label="Body text preview"
              className="mt-2 text-gw-ink"
              style={{
                fontFamily: draft.fontFamily || undefined,
                fontSize: draft.fontSize || undefined,
                lineHeight: draft.lineHeight || undefined,
              }}
            >
              The quick brown fox jumps over the lazy dog. Writers shape worlds
              from words, one sentence at a time.
            </p>
          </div>
        </div>
      </Card>

      {errorMessage ? (
        <p className="text-sm text-gw-secondary" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <footer className="flex justify-end gap-3 border-t border-gw-border pt-5">
        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant="default"
          onClick={() => void handleSave()}
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </footer>
    </div>
  );
}
