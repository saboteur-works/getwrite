"use client";

import React, { useState } from "react";
import Button from "../common/UI/Button/Button";
import Card from "../common/UI/Card/Card";
import Input from "../common/UI/Input/Input";
import { setDailyWordGoal } from "../../src/lib/api/writing-log";
import { notifyWritingLogGoalChanged } from "../../src/lib/writing-log-signal";

export interface DailyWordGoalFieldProps {
  /** Server-validated id of the active project. */
  projectId: string;
  /** Currently saved daily goal; omitted when none is set. */
  initialGoal?: number;
}

const INVALID_MESSAGE = "Enter a whole number of words, 0 or greater.";

/**
 * Parses the draft: empty means "unset" (`null`); otherwise a non-negative
 * integer. Returns `undefined` for anything else.
 */
function parseGoal(draft: string): number | null | undefined {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Sets or clears the project's daily writing goal (`dailyWordGoal`), saved
 * through the writing-log transport. Distinct from the project-wide
 * `wordCountGoal`, which is a total target rather than a per-day one.
 * Errors are not red (STYLING.md): they are conveyed by text and
 * `role="alert"` / `aria-invalid`.
 */
export default function DailyWordGoalField({
  projectId,
  initialGoal,
}: DailyWordGoalFieldProps): JSX.Element {
  const [draft, setDraft] = useState<string>(
    initialGoal === undefined ? "" : String(initialGoal),
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    setSavedMessage(null);
    const goal = parseGoal(draft);
    if (goal === undefined) {
      setErrorMessage(INVALID_MESSAGE);
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await setDailyWordGoal(projectId, goal);
      notifyWritingLogGoalChanged();
      setSavedMessage(
        goal === null ? "Daily goal cleared." : "Daily goal saved.",
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? `Failed to save daily goal: ${err.message}`
          : "Failed to save daily goal.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="daily-word-goal-heading"
      className="mt-6 flex w-full flex-col gap-3"
    >
      <h3
        id="daily-word-goal-heading"
        className="text-base font-semibold text-gw-primary"
      >
        Daily writing goal
      </h3>
      <p className="max-w-2xl text-sm text-gw-secondary">
        Words to write each day. Separate from the project&apos;s overall word
        count goal. Leave empty for no daily goal.
      </p>
      <Card padding="lg" className="flex flex-col gap-3">
        <label
          htmlFor="daily-word-goal"
          className="text-sm font-medium text-gw-primary"
        >
          Daily word goal
        </label>
        <Input
          id="daily-word-goal"
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={errorMessage !== null && parseGoal(draft) === undefined}
          aria-describedby={errorMessage ? "daily-word-goal-error" : undefined}
          className="w-full"
        />
        {errorMessage ? (
          <p
            id="daily-word-goal-error"
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
            {isSaving ? "Saving…" : "Save daily goal"}
          </Button>
        </div>
      </Card>
    </section>
  );
}
