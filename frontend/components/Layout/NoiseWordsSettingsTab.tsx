"use client";

import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import Button from "../common/UI/Button/Button";
import Card from "../common/UI/Card/Card";
import Checkbox from "../common/UI/Checkbox/Checkbox";
import Input from "../common/UI/Input/Input";
import {
  getNoiseWordLists,
  addCustomNoiseWord,
  removeCustomNoiseWord,
  excludeGlobalNoiseWord,
  unexcludeGlobalNoiseWord,
} from "../../src/lib/api/project-noise-words";
import { getGlobalNoiseWords } from "../../src/lib/api/global-noise-words";

export interface NoiseWordsSettingsTabProps {
  /** Server-validated id of the active project. */
  projectId: string;
}

/**
 * Project Settings tab for Entity Mention Noise Flagging (FR-4/FR-6): a
 * writer's per-project custom noise-word list (add/remove, FR-3) and this
 * project's exclusions from the cross-project global noise-word list
 * (FR-6). Deliberately its own tab — not folded into "Writing Goals",
 * "Metadata", or any other pre-existing Project Settings tab, per FR-4.
 *
 * The custom-word list is read/written through `project-noise-words.ts`'s
 * client transport, which itself wraps `project-noise-words-core.ts` (Task
 * 6). The global word list is read-only here, via `getGlobalNoiseWords`
 * (Task 11) — this tab never writes to the global list, only to this
 * project's own exclusion list naming specific global words.
 */
export default function NoiseWordsSettingsTab({
  projectId,
}: NoiseWordsSettingsTabProps): JSX.Element {
  const [customWords, setCustomWords] = useState<string[]>([]);
  const [excludedGlobalWords, setExcludedGlobalWords] = useState<string[]>([]);
  const [globalWords, setGlobalWords] = useState<string[]>([]);
  const [newWord, setNewWord] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    Promise.all([getNoiseWordLists(projectId), getGlobalNoiseWords()])
      .then(([lists, global]) => {
        if (isCancelled) return;
        setCustomWords(lists.customNoiseWords);
        setExcludedGlobalWords(lists.excludedGlobalNoiseWords);
        setGlobalWords(global);
      })
      .catch((err: unknown) => {
        if (isCancelled) return;
        setErrorMessage(
          err instanceof Error && err.message
            ? `Failed to load noise-word lists: ${err.message}`
            : "Failed to load noise-word lists.",
        );
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });
    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  const handleAddCustomWord = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    const trimmed = newWord.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const lists = await addCustomNoiseWord(projectId, trimmed);
      setCustomWords(lists.customNoiseWords);
      setExcludedGlobalWords(lists.excludedGlobalNoiseWords);
      setNewWord("");
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? `Failed to add noise word: ${err.message}`
          : "Failed to add noise word.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveCustomWord = async (word: string): Promise<void> => {
    setErrorMessage(null);
    try {
      const lists = await removeCustomNoiseWord(projectId, word);
      setCustomWords(lists.customNoiseWords);
      setExcludedGlobalWords(lists.excludedGlobalNoiseWords);
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? `Failed to remove noise word: ${err.message}`
          : "Failed to remove noise word.",
      );
    }
  };

  const handleToggleGlobalExclusion = async (
    word: string,
    excluded: boolean,
  ): Promise<void> => {
    setErrorMessage(null);
    try {
      const lists = excluded
        ? await excludeGlobalNoiseWord(projectId, word)
        : await unexcludeGlobalNoiseWord(projectId, word);
      setCustomWords(lists.customNoiseWords);
      setExcludedGlobalWords(lists.excludedGlobalNoiseWords);
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? `Failed to update exclusion: ${err.message}`
          : "Failed to update exclusion.",
      );
    }
  };

  return (
    <section
      aria-labelledby="noise-words-settings-heading"
      className="flex w-full flex-col gap-6"
    >
      <header className="flex flex-col gap-1 border-b border-gw-border pb-4">
        <h2
          id="noise-words-settings-heading"
          className="text-lg font-semibold text-gw-primary"
        >
          Noise Words
        </h2>
        <p className="max-w-2xl text-sm text-gw-secondary">
          Words flagged as noise when mentioned as entities in this project. Add
          your own custom words below, and choose which words from your
          cross-project global list should not apply to this project.
        </p>
      </header>

      {errorMessage ? (
        <p role="alert" className="text-sm font-medium text-gw-primary">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-gw-secondary">Loading…</p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold text-gw-primary">
              Custom noise words
            </h3>
            {customWords.length === 0 ? (
              <p className="text-sm text-gw-secondary">
                No custom noise words yet. Add one below.
              </p>
            ) : (
              <ul className="space-y-2">
                {customWords.map((word) => (
                  <li
                    key={word}
                    className="flex items-center justify-between gap-2 rounded-md border-hairline border-gw-border bg-gw-chrome px-3 py-2"
                  >
                    <span className="text-sm text-gw-primary">{word}</span>
                    <button
                      type="button"
                      aria-label={`Remove custom noise word ${word}`}
                      className="rounded-md border border-gw-border bg-transparent p-1.5 text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2"
                      onClick={() => void handleRemoveCustomWord(word)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Card padding="lg" className="flex flex-col gap-3">
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => void handleAddCustomWord(e)}
              >
                <label
                  htmlFor="new-custom-noise-word"
                  className="text-sm font-medium text-gw-primary"
                >
                  Add a custom noise word
                </label>
                <Input
                  id="new-custom-noise-word"
                  type="text"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  className="w-full"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={!newWord.trim() || isSubmitting}
                  >
                    Add word
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold text-gw-primary">
              Global noise words
            </h3>
            <p className="max-w-2xl text-sm text-gw-secondary">
              Words from your cross-project global list. Check a word to exclude
              it from applying within this project only.
            </p>
            {globalWords.length === 0 ? (
              <p className="text-sm text-gw-secondary">
                No global noise words yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {globalWords.map((word) => {
                  const isExcluded = excludedGlobalWords.includes(word);
                  const checkboxId = `exclude-global-noise-word-${word}`;
                  return (
                    <li
                      key={word}
                      className="flex items-center justify-between gap-2 rounded-md border-hairline border-gw-border bg-gw-chrome px-3 py-2"
                    >
                      <span className="text-sm text-gw-primary">{word}</span>
                      <label
                        htmlFor={checkboxId}
                        className="flex items-center gap-2 text-sm text-gw-secondary select-none"
                      >
                        Excluded in this project
                        <Checkbox
                          id={checkboxId}
                          checked={isExcluded}
                          onChange={(e) =>
                            void handleToggleGlobalExclusion(
                              word,
                              e.target.checked,
                            )
                          }
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
