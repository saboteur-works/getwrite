"use client";

import React, { useRef, useState } from "react";
import type { EditorBodyConfig } from "../../src/lib/editor-body-settings";
import {
  getLineHeightError,
  sanitizeEditorBody,
} from "../../src/lib/editor-body-settings";
import { buildFontFamilyValue } from "../../src/lib/fonts/font-family-stack";
import TypographyFields, {
  type TypographyFieldKey,
} from "../typography/TypographyFields";
import Button from "../common/UI/Button/Button";
import Card from "../common/UI/Card/Card";

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

const BODY_FIELDS: readonly (keyof EditorBodyConfig)[] = [
  "fontFamily",
  "fontSize",
  "lineHeight",
  "paragraphSpacing",
];

function isBodyFieldKey(
  key: TypographyFieldKey,
): key is keyof EditorBodyConfig {
  return (BODY_FIELDS as readonly string[]).includes(key);
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
  // Bumped on Discard so the fields drop any refused text they hold locally.
  const [resetKey, setResetKey] = useState<number>(0);
  const fieldsRef = useRef<HTMLDivElement>(null);
  // Embedded in Project Settings (`closeOnSave` false), the secondary button
  // discards this section's unsaved edits and leaves the dialog open; closing
  // the whole dialog from here dropped every other section's unsaved edits
  // (D-12). It resets to the last saved values, not the possibly stale prop.
  const [savedBody, setSavedBody] = useState<EditorBodyConfig>(
    initialBody ?? {},
  );

  const handleDiscard = (): void => {
    setDraft(savedBody);
    setResetKey((n) => n + 1);
    setErrorMessage(null);
  };

  const handleFieldChange = (
    key: keyof EditorBodyConfig,
    value: string,
  ): void => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (): Promise<void> => {
    // Refuse, never clamp: the typed value stays and no request is sent. The
    // shared line-height field keeps a refused typed value to itself (it never
    // reaches the draft) and shows the linked alert; `aria-invalid` is how
    // this form learns of it. A refused stored value is caught from the draft.
    const hasTypedRefusal =
      fieldsRef.current?.querySelector('[aria-invalid="true"]') != null;
    if (hasTypedRefusal || getLineHeightError(draft.lineHeight)) {
      setErrorMessage(null);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const saved = sanitizeEditorBody(draft) ?? {};
      await onSave(saved);
      setSavedBody(saved);
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
    <section className="flex w-full flex-col gap-6">
      {/* This wrapper is a <section> so the <header> below is a section
          header rather than the `banner` landmark: a <header> outside
          sectioning content maps to `banner`, and this panel renders inside
          ProjectSettingsDialog alongside the app top bar, which axe-core
          flags as `landmark-no-duplicate-banner`. EncryptionSettings.tsx
          already used this shape. */}
      <header className="flex flex-col gap-1 border-b border-gw-border pb-4">
        <h2 className="text-lg font-semibold text-gw-primary">
          Body Text Styles
        </h2>
        <p className="max-w-2xl text-sm text-gw-secondary">
          Configure default body text typography for this project. These
          settings apply to body text that has no spacing of its own. Line
          height must be at least 1.8, and a paragraph with its own spacing
          keeps it.
        </p>
      </header>

      <Card as="section" padding="lg">
        <div ref={fieldsRef} className="grid gap-3 md:grid-cols-2">
          <TypographyFields
            key={resetKey}
            className="contents"
            label="Body"
            idPrefix="body"
            fields={BODY_FIELDS}
            values={draft}
            allowOther
            onChange={(key, value) => {
              if (isBodyFieldKey(key)) handleFieldChange(key, value);
            }}
          />

          <div className="mt-4 border-t border-gw-border pt-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary">
              Preview
            </span>
            <p
              aria-label="Body text preview"
              className="mt-2 text-gw-ink"
              style={{
                fontFamily: buildFontFamilyValue(draft.fontFamily),
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
        <Button
          variant="secondary"
          size="sm"
          onClick={closeOnSave ? onClose : handleDiscard}
          disabled={isSaving}
        >
          {closeOnSave ? "Cancel" : "Discard changes"}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => void handleSave()}
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : "Save Changes"}
        </Button>
      </footer>
    </section>
  );
}
