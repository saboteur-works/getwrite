"use client";

import React, { useState } from "react";
import type { EditorHeading, EditorHeadings } from "../../src/lib/models/types";
import {
  buildHeadingDraft,
  DEFAULT_VISIBLE_HEADING_LEVELS,
  getNextHeadingLevel,
  getVisibleHeadingLevels,
  sanitizeEditorHeading,
  sanitizeEditorHeadingMap,
  type EditorHeadingFieldKey,
  type EditorHeadingMap,
} from "../../src/lib/editor-heading-settings";
import { buildFontFamilyValue } from "../../src/lib/fonts/font-family-stack";
import TypographyFields, {
  useRefusedFields,
  type TypographyFieldKey,
} from "../typography/TypographyFields";
import Button from "../common/UI/Button/Button";
import Card from "../common/UI/Card/Card";

interface HeadingSettingsModalProps {
  initialHeadings?: EditorHeadingMap;
  onClose: () => void;
  onSave: (headings: EditorHeadingMap) => Promise<void>;
  /**
   * Whether a successful save should also close the dialog. Defaults to
   * `true` for standalone usage. The consolidated Project Settings dialog
   * passes `false` so saving one section doesn't dismiss the whole surface.
   */
  closeOnSave?: boolean;
}

function getHeadingLabel(level: EditorHeadings): string {
  return level.toUpperCase();
}

const HEADING_FIELDS: readonly EditorHeadingFieldKey[] = [
  "fontSize",
  "fontFamily",
  "fontWeight",
  "letterSpacing",
  "color",
];

function isHeadingFieldKey(
  key: TypographyFieldKey,
): key is EditorHeadingFieldKey {
  return (HEADING_FIELDS as readonly string[]).includes(key);
}

export default function HeadingSettingsModal({
  initialHeadings,
  onClose,
  onSave,
  closeOnSave = true,
}: HeadingSettingsModalProps): JSX.Element {
  const [draftHeadings, setDraftHeadings] = useState<EditorHeadingMap>(() =>
    buildHeadingDraft(initialHeadings),
  );
  const [visibleLevels, setVisibleLevels] = useState<EditorHeadings[]>(() =>
    getVisibleHeadingLevels(initialHeadings),
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const { isBlocked: hasRefusal, report: reportRefusal } = useRefusedFields();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Embedded in Project Settings (`closeOnSave` false), the secondary button
  // discards this section's unsaved edits and leaves the dialog open; closing
  // the whole dialog from here dropped every other section's unsaved edits
  // (D-12). It resets to the last saved values, not the possibly stale prop.
  const [savedHeadings, setSavedHeadings] = useState<
    EditorHeadingMap | undefined
  >(initialHeadings);

  // Bumped on Discard so the fields drop any refused text they hold locally.
  const [resetKey, setResetKey] = useState<number>(0);

  const handleDiscard = (): void => {
    setResetKey((key) => key + 1);
    setDraftHeadings(buildHeadingDraft(savedHeadings));
    setVisibleLevels(getVisibleHeadingLevels(savedHeadings));
    setErrorMessage(null);
  };

  const nextHeadingLevel = getNextHeadingLevel(visibleLevels);

  const handleFieldChange = (
    level: EditorHeadings,
    key: EditorHeadingFieldKey,
    value: string,
  ): void => {
    setDraftHeadings((previousDraft) => {
      const nextHeading: EditorHeading = {
        ...(previousDraft[level] ?? {}),
        [key]: value,
      };

      return { ...previousDraft, [level]: nextHeading };
    });
  };

  const handleAddHeading = (): void => {
    if (!nextHeadingLevel) {
      return;
    }

    setVisibleLevels((previousLevels) => [...previousLevels, nextHeadingLevel]);
    setDraftHeadings((previousDraft) => ({
      ...previousDraft,
      [nextHeadingLevel]: previousDraft[nextHeadingLevel] ?? {},
    }));
  };

  const handleRemoveHeading = (level: EditorHeadings): void => {
    if (DEFAULT_VISIBLE_HEADING_LEVELS.includes(level)) {
      return;
    }

    setVisibleLevels((previousLevels) =>
      previousLevels.filter((visibleLevel) => visibleLevel !== level),
    );
    setDraftHeadings((previousDraft) => {
      const nextDraft = { ...previousDraft };

      delete nextDraft[level];

      return nextDraft;
    });
  };

  const handleSave = async (): Promise<void> => {
    // Refuse, never clamp: a typed font name that was refused keeps Save inert.
    if (hasRefusal) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const saved = sanitizeEditorHeadingMap(draftHeadings);
      await onSave(saved);
      setSavedHeadings(saved);
      if (closeOnSave) {
        onClose();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to save heading settings.",
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
          Heading Styles
        </h2>
        <p className="max-w-2xl text-sm text-gw-secondary">
          Configure project-specific heading styles for the editor. H1 through
          H3 are always available, and you can add H4 through H6 as needed.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {visibleLevels.map((level) => {
          const heading = draftHeadings[level] ?? {};
          const label = getHeadingLabel(level);
          const isOptionalLevel =
            !DEFAULT_VISIBLE_HEADING_LEVELS.includes(level);

          return (
            <Card as="section" key={level} padding="lg">
              <div className="flex items-center justify-between gap-4 border-b border-gw-border pb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gw-primary">
                    {label}
                  </h2>
                  <p className="mt-1 text-sm text-gw-secondary">
                    Set the typography attributes applied to {label} in the
                    editor.
                  </p>
                  {/* An empty level stores nothing, so saving drops it; say
                      so rather than let it vanish after a save (D-11). */}
                  {isOptionalLevel && !sanitizeEditorHeading(heading) ? (
                    <p className="mt-1 text-sm text-gw-secondary">
                      No styles set, so this level is not kept when you save.
                    </p>
                  ) : null}
                </div>
                {isOptionalLevel ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRemoveHeading(level)}
                  >
                    Remove {label}
                  </Button>
                ) : null}
              </div>

              <TypographyFields
                key={resetKey}
                className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
                label={label}
                idPrefix={level}
                fields={HEADING_FIELDS}
                values={heading}
                allowOther
                onRefusalChange={(key, refused) =>
                  reportRefusal(`${level}.${key}`, refused)
                }
                onChange={(key, value) => {
                  if (isHeadingFieldKey(key)) {
                    handleFieldChange(level, key, value);
                  }
                }}
              />

              <div className="mt-4 border-t border-gw-border pt-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary">
                  Preview
                </span>
                <p
                  aria-label={`${label} preview`}
                  className="mt-2 leading-snug"
                  style={{
                    fontFamily: buildFontFamilyValue(heading.fontFamily),
                    fontSize: heading.fontSize || undefined,
                    fontWeight: heading.fontWeight || undefined,
                    letterSpacing: heading.letterSpacing || undefined,
                    color: heading.color || "var(--color-gw-ink)",
                  }}
                >
                  The quick brown fox jumps over the lazy dog
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-gw-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {nextHeadingLevel ? (
            <Button variant="secondary" size="sm" onClick={handleAddHeading}>
              Add {getHeadingLabel(nextHeadingLevel)}
            </Button>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary">
              All heading levels enabled
            </span>
          )}
          {errorMessage ? (
            <p className="text-sm text-gw-secondary" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3">
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
            onClick={() => {
              void handleSave();
            }}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </section>
  );
}
