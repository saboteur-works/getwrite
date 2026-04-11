"use client";

import React, { useMemo, useState } from "react";
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

interface HeadingSettingsModalProps {
    initialHeadings?: EditorHeadingMap;
    onClose: () => void;
    onSave: (headings: EditorHeadingMap) => Promise<void>;
}

function getHeadingLabel(level: EditorHeadings): string {
    return level.toUpperCase();
}

const FONT_WEIGHT_OPTIONS: Array<{ label: string; value: string }> = [
    { label: "Normal", value: "400" },
    { label: "Bold", value: "700" },
];

function toFontSizeInputValue(fontSize: string | undefined): string {
    if (!fontSize) {
        return "";
    }

    const numericValue = Number.parseInt(fontSize, 10);

    return Number.isNaN(numericValue) ? "" : String(numericValue);
}

function toFontWeightSelectValue(fontWeight: string | undefined): string {
    if (!fontWeight) {
        return "";
    }

    const normalizedWeight = fontWeight.trim().toLowerCase();

    if (normalizedWeight === "bold" || normalizedWeight === "700") {
        return "700";
    }

    if (normalizedWeight === "normal" || normalizedWeight === "400") {
        return "400";
    }

    return "";
}

function toLetterSpacingInputValue(letterSpacing: string | undefined): string {
    if (!letterSpacing) {
        return "";
    }

    const numericValue = Number.parseFloat(letterSpacing);

    return Number.isNaN(numericValue) ? "" : String(numericValue);
}

function toColorInputValue(color: string | undefined): string {
    const normalizedColor = color?.trim();

    if (!normalizedColor) {
        return "#000000";
    }

    const isHexColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(
        normalizedColor,
    );

    return isHexColor ? normalizedColor : "#000000";
}

export default function HeadingSettingsModal({
    initialHeadings,
    onClose,
    onSave,
}: HeadingSettingsModalProps): JSX.Element {
    const [draftHeadings, setDraftHeadings] = useState<EditorHeadingMap>(() =>
        buildHeadingDraft(initialHeadings),
    );
    const [visibleLevels, setVisibleLevels] = useState<EditorHeadings[]>(() =>
        getVisibleHeadingLevels(initialHeadings),
    );
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const nextHeadingLevel = useMemo(() => {
        return getNextHeadingLevel(visibleLevels);
    }, [visibleLevels]);

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

            return {
                ...previousDraft,
                [level]: nextHeading,
            };
        });
    };

    const handleAddHeading = (): void => {
        if (!nextHeadingLevel) {
            return;
        }

        setVisibleLevels((previousLevels) => [
            ...previousLevels,
            nextHeadingLevel,
        ]);
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
            onClose();
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
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 lg:px-10">
            <header className="flex items-start justify-between gap-4 border-b border-gw-border pb-5">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-gw-primary">
                        Heading Settings
                    </h1>
                    <p className="max-w-2xl text-sm text-gw-secondary">
                        Configure project-specific heading styles for the
                        editor. H1 through H3 are always available, and you can
                        add H4 through H6 as needed.
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

            <div className="flex flex-col gap-4">
                {visibleLevels.map((level) => {
                    const heading = draftHeadings[level] ?? {};
                    const isOptionalLevel =
                        !DEFAULT_VISIBLE_HEADING_LEVELS.includes(level);

                    return (
                        <section
                            key={level}
                            className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5"
                        >
                            <div className="flex items-center justify-between gap-4 border-b border-gw-border pb-4">
                                <div>
                                    <h2 className="text-sm font-semibold text-gw-primary">
                                        {getHeadingLabel(level)}
                                    </h2>
                                    <p className="mt-1 text-sm text-gw-secondary">
                                        Set the typography attributes applied to{" "}
                                        {getHeadingLabel(level)} in the editor.
                                    </p>
                                </div>
                                {isOptionalLevel ? (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleRemoveHeading(level)
                                        }
                                        className="rounded-md border border-gw-border bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2"
                                    >
                                        Remove {getHeadingLabel(level)}
                                    </button>
                                ) : null}
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <HeadingStyleField
                                    id={`${level}-fontSize`}
                                    label="Font Size"
                                >
                                    <input
                                        id={`${level}-fontSize`}
                                        aria-label={`${getHeadingLabel(level)} Font Size`}
                                        type="number"
                                        step="1"
                                        min="1"
                                        value={toFontSizeInputValue(
                                            heading.fontSize,
                                        )}
                                        placeholder="e.g. 32"
                                        onChange={(event) => {
                                            const value = event.target.value;

                                            handleFieldChange(
                                                level,
                                                "fontSize",
                                                value ? `${value}px` : "",
                                            );
                                        }}
                                        className="rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md"
                                    />
                                </HeadingStyleField>

                                <HeadingStyleField
                                    id={`${level}-fontFamily`}
                                    label="Font Family"
                                >
                                    <input
                                        id={`${level}-fontFamily`}
                                        aria-label={`${getHeadingLabel(level)} Font Family`}
                                        value={heading.fontFamily ?? ""}
                                        placeholder="e.g. IBM Plex Sans"
                                        onChange={(event) =>
                                            handleFieldChange(
                                                level,
                                                "fontFamily",
                                                event.target.value,
                                            )
                                        }
                                        className="rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md"
                                    />
                                </HeadingStyleField>

                                <HeadingStyleField
                                    id={`${level}-fontWeight`}
                                    label="Font Weight"
                                >
                                    <select
                                        id={`${level}-fontWeight`}
                                        aria-label={`${getHeadingLabel(level)} Font Weight`}
                                        value={toFontWeightSelectValue(
                                            heading.fontWeight,
                                        )}
                                        onChange={(event) =>
                                            handleFieldChange(
                                                level,
                                                "fontWeight",
                                                event.target.value,
                                            )
                                        }
                                        className="rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 focus:border-gw-border-md"
                                    >
                                        <option value="">Use default</option>
                                        {FONT_WEIGHT_OPTIONS.map((option) => (
                                            <option
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </HeadingStyleField>

                                <HeadingStyleField
                                    id={`${level}-letterSpacing`}
                                    label="Letter Spacing"
                                >
                                    <input
                                        id={`${level}-letterSpacing`}
                                        aria-label={`${getHeadingLabel(level)} Letter Spacing`}
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={toLetterSpacingInputValue(
                                            heading.letterSpacing,
                                        )}
                                        placeholder="e.g. 0.08"
                                        onChange={(event) => {
                                            const value = event.target.value;

                                            handleFieldChange(
                                                level,
                                                "letterSpacing",
                                                value ? `${value}em` : "",
                                            );
                                        }}
                                        className="rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md"
                                    />
                                </HeadingStyleField>

                                <HeadingStyleField label="Color">
                                    <div className="flex items-center gap-3 rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2">
                                        <button
                                            type="button"
                                            aria-label={`Choose ${getHeadingLabel(level)} color`}
                                            onClick={() => {
                                                const colorInput =
                                                    document.getElementById(
                                                        `${level}-color`,
                                                    ) as HTMLInputElement | null;

                                                colorInput?.click();
                                            }}
                                            className="inline-flex items-center justify-center rounded-sm border border-gw-border px-2 py-1 transition-colors duration-150 hover:bg-gw-surface"
                                        >
                                            <Pipette
                                                size={18}
                                                className="text-gw-secondary"
                                                fill={toColorInputValue(
                                                    heading.color,
                                                )}
                                            />
                                        </button>
                                        <input
                                            id={`${level}-color`}
                                            aria-label={`${getHeadingLabel(level)} Color`}
                                            type="color"
                                            value={toColorInputValue(
                                                heading.color,
                                            )}
                                            onChange={(event) =>
                                                handleFieldChange(
                                                    level,
                                                    "color",
                                                    event.target.value,
                                                )
                                            }
                                            className="hidden"
                                        />
                                    </div>
                                </HeadingStyleField>
                            </div>
                        </section>
                    );
                })}
            </div>

            <div className="flex flex-col gap-3 border-t border-gw-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {nextHeadingLevel ? (
                        <button
                            type="button"
                            onClick={handleAddHeading}
                            className="rounded-md border border-gw-border bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2"
                        >
                            Add {getHeadingLabel(nextHeadingLevel)}
                        </button>
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
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-gw-border bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2"
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            void handleSave();
                        }}
                        className="rounded-md border border-gw-border-md bg-gw-chrome2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gw-primary transition-colors duration-150 hover:bg-gw-surface disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isSaving}
                    >
                        {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}
