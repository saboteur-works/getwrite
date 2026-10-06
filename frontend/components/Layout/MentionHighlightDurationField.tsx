"use client";

import React, { useState } from "react";
import Button from "../common/UI/Button/Button";
import Card from "../common/UI/Card/Card";
import Input from "../common/UI/Input/Input";
import {
  DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS,
  setMentionHighlightDuration,
} from "../../src/lib/api/mention-highlight-duration";

export interface MentionHighlightDurationFieldProps {
  /** Server-validated id of the active project. */
  projectId: string;
  /**
   * Currently saved `config.mentionHighlightDurationSeconds`; omitted when
   * the project has never set a value, in which case the field prefills
   * with {@link DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS}.
   */
  initialDurationSeconds?: number;
}

const INVALID_MESSAGE = "Enter a whole number of seconds, 1 to 10.";

/**
 * Parses the draft into an integer 1-10 inclusive, or `undefined` for
 * anything else (including empty — unlike `WordCountGoalField`'s
 * `parseGoal`, this field has no "unset" value of its own: clearing the
 * field and saving restores the server-side default by sending `null`,
 * mirrored here as the empty-string case).
 */
function parseDuration(draft: string): number | null | undefined {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1 || value > 10) return undefined;
  return value;
}

/**
 * Sets or clears the project's mention-jump highlight duration
 * (`config.mentionHighlightDurationSeconds`), a number input following
 * `WordCountGoalField.tsx`'s free-text/`inputMode="numeric"`/explicit-Save
 * convention rather than a slider. A value outside 1-10 or a non-integer is
 * rejected client-side with an accessible error rather than clamped,
 * mirroring the core's own reject-not-clamp contract (FR-10). Errors are
 * not red (STYLING.md): they are conveyed by text and `role="alert"` /
 * `aria-invalid`.
 */
export default function MentionHighlightDurationField({
  projectId,
  initialDurationSeconds,
}: MentionHighlightDurationFieldProps): JSX.Element {
  const [draft, setDraft] = useState<string>(
    String(
      initialDurationSeconds ?? DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS,
    ),
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    setSavedMessage(null);
    const duration = parseDuration(draft);
    if (duration === undefined) {
      setErrorMessage(INVALID_MESSAGE);
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const result = await setMentionHighlightDuration(projectId, duration);
      setDraft(
        String(
          result.mentionHighlightDurationSeconds ??
            DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS,
        ),
      );
      setSavedMessage(
        duration === null
          ? "Mention-highlight duration reset to the default."
          : "Mention-highlight duration saved.",
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? `Failed to save mention-highlight duration: ${err.message}`
          : "Failed to save mention-highlight duration.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="mention-highlight-duration-heading"
      className="mt-6 flex w-full flex-col gap-3"
    >
      <h3
        id="mention-highlight-duration-heading"
        className="text-base font-semibold text-gw-primary"
      >
        Mention-jump highlight duration
      </h3>
      <p className="max-w-2xl text-sm text-gw-secondary">
        How long, in seconds, a mention stays highlighted after jumping to it in
        the editor. Leave empty to restore the default (
        {DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS} seconds).
      </p>
      <Card padding="lg" className="flex flex-col gap-3">
        <label
          htmlFor="mention-highlight-duration"
          className="text-sm font-medium text-gw-primary"
        >
          Highlight duration (seconds)
        </label>
        <Input
          id="mention-highlight-duration"
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={
            errorMessage !== null && parseDuration(draft) === undefined
          }
          aria-describedby={
            errorMessage ? "mention-highlight-duration-error" : undefined
          }
          className="w-full"
        />
        {errorMessage ? (
          <p
            id="mention-highlight-duration-error"
            role="alert"
            className="text-sm font-medium text-gw-primary"
          >
            {errorMessage}
          </p>
        ) : null}
        <p role="status" className="text-sm text-gw-secondary">
          {savedMessage}
        </p>
        <div className="flex justify-end">
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save highlight duration"}
          </Button>
        </div>
      </Card>
    </section>
  );
}
