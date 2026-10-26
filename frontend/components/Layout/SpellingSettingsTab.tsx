"use client";

import React, { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import Button from "../common/UI/Button/Button";
import { useAppDispatch, useAppSelector } from "../../src/store/hooks";
import {
  removeProjectWord,
  selectSpellingLists,
  selectSpellingStatus,
  unignoreWord,
} from "../../src/store/spellingSlice";
import type { SpellingState } from "../../src/store/spellingSlice";

type ListKey = "dictionary" | "ignored";

interface ListSpec {
  key: ListKey;
  title: string;
  /** Lower-case name used in the remove button's accessible name. */
  noun: string;
  empty: string;
}

const LIST_SPECS: readonly ListSpec[] = [
  {
    key: "dictionary",
    title: "Project dictionary",
    noun: "project dictionary",
    empty: "No words in the project dictionary.",
  },
  {
    key: "ignored",
    title: "Ignored words",
    noun: "ignored words",
    empty: "No ignored words.",
  },
];

/** Words sorted ignoring case, ties broken by the raw spelling. */
function sortIgnoringCase(words: readonly string[]): string[] {
  return [...words].sort((a, b) => {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la !== lb) return la < lb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Where focus goes once `word` has left `sorted`: next, previous, or heading. */
function focusTargetAfterRemoval(
  sorted: string[],
  word: string,
): string | null {
  const index = sorted.indexOf(word);
  return sorted[index + 1] ?? sorted[index - 1] ?? null;
}

interface PendingFocus {
  list: ListKey;
  /** Word whose remove button takes focus; `null` means the list heading. */
  word: string | null;
}

/**
 * Project Settings "Spelling" tab (spell-checker FR-38/FR-39): the project
 * dictionary and the ignored words of the active project, each with a count,
 * sorted words, an empty-state sentence and a remove button per word.
 *
 * Reads and writes the `spelling` slice, so it needs a Redux `Provider`
 * whose store has that reducer and a loaded (or failed) slice. A removal
 * replaces the lists from the server response; an open editor reads the same
 * slice, so the word's underline returns at once. There is no "add a word"
 * field (non-goal).
 */
export default function SpellingSettingsTab(): JSX.Element {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectSpellingStatus);
  const lists = useAppSelector(selectSpellingLists);
  const errorMessage = useAppSelector(
    (state: { spelling: SpellingState }) => state.spelling.errorMessage,
  );
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const headingRefs = useRef<Map<ListKey, HTMLHeadingElement>>(new Map());

  useEffect(() => {
    if (!pendingFocus) return;
    const target =
      pendingFocus.word === null
        ? headingRefs.current.get(pendingFocus.list)
        : buttonRefs.current.get(`${pendingFocus.list}:${pendingFocus.word}`);
    target?.focus();
    setPendingFocus(null);
  }, [pendingFocus, lists]);

  const remove = async (
    spec: ListSpec,
    sorted: string[],
    word: string,
  ): Promise<void> => {
    setRemoveError(null);
    const thunk = spec.key === "dictionary" ? removeProjectWord : unignoreWord;
    try {
      await dispatch(thunk(word)).unwrap();
      setPendingFocus({
        list: spec.key,
        word: focusTargetAfterRemoval(sorted, word),
      });
    } catch (err) {
      setRemoveError(
        err instanceof Error && err.message
          ? `Could not remove ${word} from ${spec.noun}: ${err.message}`
          : `Could not remove ${word} from ${spec.noun}.`,
      );
    }
  };

  const wordsFor = (key: ListKey): string[] =>
    sortIgnoringCase(
      key === "dictionary"
        ? lists.spellingProjectWords
        : lists.spellingIgnoredWords,
    );

  return (
    <section
      aria-labelledby="spelling-settings-heading"
      className="flex w-full flex-col gap-6"
    >
      <header className="flex flex-col gap-1 border-b border-gw-border pb-4">
        <h2
          id="spelling-settings-heading"
          className="text-lg font-semibold text-gw-primary"
        >
          Spelling
        </h2>
        <p className="max-w-2xl text-sm text-gw-secondary">
          Words you added to this project&apos;s dictionary and words you chose
          to ignore. Removing a word makes it a candidate for a spelling
          underline again.
        </p>
      </header>

      {removeError ? (
        <p role="alert" className="text-sm font-medium text-gw-primary">
          {removeError}
        </p>
      ) : null}

      {status === "not-loaded" ? (
        <p className="text-sm text-gw-secondary">Loading…</p>
      ) : status === "failed" ? (
        <p className="text-sm font-medium text-gw-primary">
          Could not load the spelling lists.
          {errorMessage ? ` ${errorMessage}` : ""}
        </p>
      ) : (
        LIST_SPECS.map((spec) => {
          const words = wordsFor(spec.key);
          const headingId = `spelling-${spec.key}-heading`;
          return (
            <div key={spec.key} className="flex flex-col gap-3">
              <h3
                id={headingId}
                tabIndex={-1}
                ref={(el) => {
                  if (el) headingRefs.current.set(spec.key, el);
                  else headingRefs.current.delete(spec.key);
                }}
                className="text-base font-semibold text-gw-primary"
              >
                {spec.title} ({words.length})
              </h3>
              {words.length === 0 ? (
                <p className="text-sm text-gw-secondary">{spec.empty}</p>
              ) : (
                <ul aria-labelledby={headingId} className="space-y-2">
                  {words.map((word) => (
                    <li
                      key={word}
                      className="flex items-center justify-between gap-2 rounded-md border-hairline border-gw-border bg-gw-chrome px-3 py-2"
                    >
                      <span className="text-sm text-gw-primary">{word}</span>
                      <Button
                        variant="ghost"
                        aria-label={`Remove ${word} from ${spec.noun}`}
                        ref={(el) => {
                          const k = `${spec.key}:${word}`;
                          if (el) buttonRefs.current.set(k, el);
                          else buttonRefs.current.delete(k);
                        }}
                        onClick={() => void remove(spec, words, word)}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
