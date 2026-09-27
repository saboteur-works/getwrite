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

const PERSIST_ERROR =
  "Couldn't save the word count goal. Your input hasn't been lost — try again.";

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

/**
 * Returns a copy of `resource` with `wordCountGoal` explicitly set to
 * `undefined`, mirroring `EntitySection.tsx`'s `withEntityKind` precedent
 * (Task 12): `updateResource`'s reducer (`store/resourcesSlice.ts`) merges a
 * dispatched partial update with a shallow `{ ...previous, ...update }`
 * spread, which only overwrites keys *present* on `update` — an omitted key
 * leaves the previous value in place in Redux. `JSON.stringify` drops an
 * `undefined`-valued key on its own, so the persisted sidecar payload sent to
 * `updateSidecar` still omits `wordCountGoal` entirely regardless; clearing
 * on disk goes through the separate `clearKeys` parameter passed to `persist`
 * below, not through this object's shape.
 */
function withoutWordCountGoal(resource: AnyResource): AnyResource {
  return { ...resource, wordCountGoal: undefined } as AnyResource;
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
 *
 * A sidecar write that itself fails (`updateSidecar` now rejects on a
 * non-2xx response, Task 12) surfaces the same accessible `role="alert"`
 * message rather than failing silently; the writer's typed value is not
 * rolled back, since the optimistic Redux update already dispatched.
 */
export default function WordCountGoalSection(): JSX.Element | null {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const resource = useAppSelector((state) => selectResource(state.resources));
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);

  const persist = (updated: AnyResource, clearKeys?: string[]): void => {
    dispatch(updateResource(updated));
    if (!projectId) return;
    void updateSidecar(updated.id, projectId, updated, clearKeys)
      .then(() => {
        // A later successful save clears an earlier failure's message.
        setError(null);
      })
      .catch(() => {
        // The optimistic Redux update above is not rolled back — the
        // writer's typed value stays on screen — but the write silently
        // failing is not acceptable (Task 12): surface it so the writer
        // knows to retry rather than assuming it saved.
        setError(PERSIST_ERROR);
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
