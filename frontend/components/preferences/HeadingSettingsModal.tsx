"use client";

import React, { useState } from "react";
import type { EditorHeading, EditorHeadings } from "../../src/lib/models/types";
import { Pipette } from "lucide-react";
import {
  buildHeadingDraft,
  DEFAULT_VISIBLE_HEADING_LEVELS,
  getNextHeadingLevel,
  getVisibleHeadingLevels,
  sanitizeEditorHeadingMap,
  type EditorHeadingFieldKey,
  type EditorHeadingMap,
} from "../../src/lib/editor-heading-settings";
import HeadingStyleField from "./HeadingStyleField";
import FontFamilyInput from "./FontFamilyInput";
import Button from "../common/UI/Button/Button";
import Card from "../common/UI/Card/Card";
import Input from "../common/UI/Input/Input";
import Select from "../common/UI/Select/Select";

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

const FONT_WEIGHT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Normal", value: "400" },
  { label: "Bold", value: "700" },
];

function toFontSizeInputValue(fontSize: string | undefined): string {
  const n = Number.parseInt(fontSize ?? "", 10);
  return Number.isNaN(n) ? "" : String(n);
}

function toFontWeightSelectValue(fontWeight: string | undefined): string {
  const normalized = fontWeight?.trim().toLowerCase();
  if (normalized === "bold" || normalized === "700") return "700";
  if (normalized === "normal" || normalized === "400") return "400";
  return "";
}

function toLetterSpacingInputValue(letterSpacing: string | undefined): string {
  const n = Number.parseFloat(letterSpacing ?? "");
  return Number.isNaN(n) ? "" : String(n);
}

function toColorInputValue(color: string | undefined): string {
  const normalizedColor = color?.trim();

  if (!normalizedColor) {
    return "#000000"; // GW-HEX-EXEMPT: color picker placeholder — user-selected arbitrary colors
  }

  const isHexColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalizedColor);

  return isHexColor ? normalizedColor : "#000000"; // GW-HEX-EXEMPT: color picker placeholder — user-selected arbitrary colors
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await onSave(sanitizeEditorHeadingMap(draftHeadings));
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

  const handleColorPickerClick = (level: EditorHeadings): void => {
    const colorInput = document.getElementById(
      `${level}-color`,
    ) as HTMLInputElement | null;

    colorInput?.click();
  };

  const makeUnitChangeHandler =
    (level: EditorHeadings, key: EditorHeadingFieldKey, unit: string) =>
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const { value } = event.target;
      handleFieldChange(level, key, value ? `${value}${unit}` : "");
    };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 lg:px-10">
      <header className="flex items-start justify-between gap-4 border-b border-gw-border pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-gw-primary">
            Heading Settings
          </h1>
          <p className="max-w-2xl text-sm text-gw-secondary">
            Configure project-specific heading styles for the editor. H1 through
            H3 are always available, and you can add H4 through H6 as needed.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
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

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <HeadingStyleField id={`${level}-fontSize`} label="Font Size">
                  <Input
                    id={`${level}-fontSize`}
                    aria-label={`${label} Font Size`}
                    type="number"
                    step="1"
                    min="1"
                    value={toFontSizeInputValue(heading.fontSize)}
                    placeholder="e.g. 32"
                    onChange={makeUnitChangeHandler(level, "fontSize", "px")}
                  />
                </HeadingStyleField>

                <HeadingStyleField
                  id={`${level}-fontFamily`}
                  label="Font Family"
                >
                  <FontFamilyInput
                    id={`${level}-fontFamily`}
                    aria-label={`${label} Font Family`}
                    value={heading.fontFamily ?? ""}
                    placeholder="e.g. IBM Plex Sans"
                    onChange={(event) =>
                      handleFieldChange(level, "fontFamily", event.target.value)
                    }
                  />
                </HeadingStyleField>

                <HeadingStyleField
                  id={`${level}-fontWeight`}
                  label="Font Weight"
                >
                  <Select
                    id={`${level}-fontWeight`}
                    aria-label={`${label} Font Weight`}
                    value={toFontWeightSelectValue(heading.fontWeight)}
                    onChange={(event) =>
                      handleFieldChange(level, "fontWeight", event.target.value)
                    }
                  >
                    <option value="">Use default</option>
                    {FONT_WEIGHT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </HeadingStyleField>

                <HeadingStyleField
                  id={`${level}-letterSpacing`}
                  label="Letter Spacing"
                >
                  <Input
                    id={`${level}-letterSpacing`}
                    aria-label={`${label} Letter Spacing`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={toLetterSpacingInputValue(heading.letterSpacing)}
                    placeholder="e.g. 0.08"
                    onChange={makeUnitChangeHandler(
                      level,
                      "letterSpacing",
                      "em",
                    )}
                  />
                </HeadingStyleField>

                <HeadingStyleField label="Color">
                  <div className="flex items-center gap-3 rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2">
                    <button
                      type="button"
                      aria-label={`Choose ${label} color`}
                      onClick={() => handleColorPickerClick(level)}
                      className="inline-flex items-center justify-center rounded-sm border border-gw-border px-2 py-1 transition-colors duration-150 hover:bg-gw-surface"
                    >
                      <Pipette
                        size={18}
                        className="text-gw-secondary"
                        fill={toColorInputValue(heading.color)}
                      />
                    </button>
                    <input
                      id={`${level}-color`}
                      aria-label={`${label} Color`}
                      type="color"
                      value={toColorInputValue(heading.color)}
                      onChange={(event) =>
                        handleFieldChange(level, "color", event.target.value)
                      }
                      className="hidden"
                    />
                  </div>
                </HeadingStyleField>
              </div>

              <div className="mt-4 border-t border-gw-border pt-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary">
                  Preview
                </span>
                <p
                  aria-label={`${label} preview`}
                  className="mt-2 leading-snug"
                  style={{
                    fontFamily: heading.fontFamily || undefined,
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
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              void handleSave();
            }}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
