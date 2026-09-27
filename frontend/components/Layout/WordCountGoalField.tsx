"use client";

import React, { useState } from "react";
import Button from "../common/UI/Button/Button";
import Card from "../common/UI/Card/Card";
import Input from "../common/UI/Input/Input";
import { setWordCountGoal } from "../../src/lib/api/word-count-goal";

export interface WordCountGoalFieldProps {
  /** Server-validated id of the active project. */
  projectId: string;
  /** Currently saved project-wide word-count goal; omitted when none is set. */
  initialGoal?: number;
}

const INVALID_MESSAGE = "Enter a whole number of words, 0 or greater.";

/**
 * Parses the draft: empty means "unset" (`null`); otherwise a non-negative
 * integer. Returns `undefined` for anything else. Mirrors
 * `DailyWordGoalField`'s `parseGoal` exactly.
 */
function parseGoal(draft: string): number | null | undefined {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Sets or clears the project's total word-count goal (`wordCountGoal`),
 * saved through the word-count-goal transport. Distinct from
 * `DailyWordGoalField`'s per-day `dailyWordGoal` — this is a total target
 * for the whole project. Errors are not red (STYLING.md): they are conveyed
 * by text and `role="alert"` / `aria-invalid`.
 */
export default function WordCountGoalField({
  projectId,
  initialGoal,
}: WordCountGoalFieldProps): JSX.Element {
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
      await setWordCountGoal(projectId, goal);
      setSavedMessage(
        goal === null
          ? "Project word-count goal cleared."
          : "Project word-count goal saved.",
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? `Failed to save word-count goal: ${err.message}`
          : "Failed to save word-count goal.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="project-word-count-goal-heading"
      className="mt-6 flex w-full flex-col gap-3"
    >
      <h3
        id="project-word-count-goal-heading"
        className="text-base font-semibold text-gw-primary"
      >
        Project word-count goal
      </h3>
      <p className="max-w-2xl text-sm text-gw-secondary">
        Total words you&apos;re aiming for across the whole project. Separate
        from the daily writing goal above. Leave empty for no goal.
      </p>
      <Card padding="lg" className="flex flex-col gap-3">
        <label
          htmlFor="project-word-count-goal"
          className="text-sm font-medium text-gw-primary"
        >
          Total word-count goal
        </label>
        <Input
          id="project-word-count-goal"
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={errorMessage !== null && parseGoal(draft) === undefined}
          aria-describedby={
            errorMessage ? "project-word-count-goal-error" : undefined
          }
          className="w-full"
        />
        {errorMessage ? (
          <p
            id="project-word-count-goal-error"
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
            {isSaving ? "Saving…" : "Save word-count goal"}
          </Button>
        </div>
      </Card>
    </section>
  );
}
