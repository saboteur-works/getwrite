"use client";

import { useState } from "react";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { selectResource, updateResource } from "../../src/store/resourcesSlice";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { updateSidecar } from "../../src/lib/api/resources";
import type { AnyResource, TextResource } from "../../src/lib/models/types";
import LabeledField from "./controls/LabeledField";
import useSyncedControlledValue from "./controls/useSyncedControlledValue";
import Input from "../common/UI/Input/Input";
import WordCountProgressBar from "../WorkArea/WordCountProgressBar";

const VALIDATION_ERROR =
  "Enter a non-negative whole number, or leave blank to clear the goal.";

/**
 * Returns a copy of `resource` with `wordCountGoal` removed entirely — not
 * set to `undefined` — so the request body sent to `updateSidecar` carries
 * no `wordCountGoal` key at all. Clearing goes through `clearKeys` exclusively
 * (Feature 61): `JSON.stringify` drops an `undefined`-valued key before the
 * request ever reaches the server, so a body that merely sets the field to
 * `undefined` would never clear it (Feature 61's brief on `patchRevisionContent`
 * names this same bug class).
 */
/**
 * Reads a text resource's current word count, mirroring `DataView.tsx`'s
 * `getWordCount`: `userMetadata.wordCount` wins over the top-level
 * `wordCount` field, which wins over `0`.
 */
function getCurrentWordCount(resource: TextResource): number {
  const userMetadataWordCount = resource.userMetadata?.wordCount;
  return typeof userMetadataWordCount === "number"
    ? userMetadataWordCount
    : (resource.wordCount ?? 0);
}

function withoutWordCountGoal(resource: AnyResource): AnyResource {
  const { wordCountGoal, ...rest } = resource as AnyResource & {
    wordCountGoal?: number;
  };
  void wordCountGoal;
  return rest as AnyResource;
}

/**
 * Sidebar section for setting or clearing a text resource's `wordCountGoal`
 * (Feature 61, Task 5). Mirrors `EntitySection.tsx`'s persist approach:
 * `updateResource` optimistically updates Redux, then `updateSidecar` writes
 * the sidecar — a set uses the ordinary call, a clear uses `clearKeys`.
 *
 * Renders only for a text resource; an image or audio resource never sees
 * this control (word count has no meaning for either).
 *
 * Validation (non-negative integer, or blank to clear) happens client-side
 * before any request is sent — a negative or non-integer value is rejected
 * with an accessible `role="alert"` message and no call to `updateSidecar`.
 */
export default function WordCountGoalSection(): JSX.Element | null {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const resource = useAppSelector((state) => selectResource(state.resources));
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);

  const persist = (updated: AnyResource, clearKeys?: string[]): void => {
    dispatch(updateResource(updated));
    if (!projectId) return;
    void updateSidecar(updated.id, projectId, updated, clearKeys).catch(() => {
      // Best-effort persistence, consistent with EntitySection.tsx — a
      // failed write is not rolled back here.
    });
  };

  const textResource = resource && resource.type === "text" ? resource : null;

  const currentText =
    textResource && typeof textResource.wordCountGoal === "number"
      ? String(textResource.wordCountGoal)
      : "";

  const [goalText, setGoalText] = useSyncedControlledValue(
    currentText,
    (nextText: string) => {
      if (!textResource) return;
      const trimmed = nextText.trim();

      if (trimmed.length === 0) {
        setError(null);
        persist(withoutWordCountGoal(textResource), ["wordCountGoal"]);
        return;
      }

      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0) {
        setError(VALIDATION_ERROR);
        return;
      }

      setError(null);
      persist({ ...textResource, wordCountGoal: parsed });
    },
  );

  if (!projectId || !textResource) return null;

  const hasGoal =
    typeof textResource.wordCountGoal === "number" &&
    textResource.wordCountGoal > 0;

  return (
    <LabeledField label="Word count goal" className="mb-4">
      <Input
        type="text"
        inputMode="numeric"
        aria-label="word-count-goal-input"
        placeholder="e.g. 2000"
        className="w-full mt-2 text-gw-label"
        value={goalText}
        onChange={(e) => setGoalText(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-gw-label text-gw-secondary mt-1">
          {error}
        </p>
      )}
      {hasGoal && (
        <WordCountProgressBar
          current={getCurrentWordCount(textResource)}
          goal={textResource.wordCountGoal as number}
          className="mt-2"
        />
      )}
    </LabeledField>
  );
}
