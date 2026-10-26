"use client";

import React, { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import Button from "../common/UI/Button/Button";
import Input from "../common/UI/Input/Input";
import { useAppDispatch, useAppSelector } from "../../src/store/hooks";
import {
  addToUserList,
  loadUserList,
  removeFromUserList,
  selectUserWordListReason,
  selectUserWordListStatus,
  selectUserWords,
} from "../../src/store/userWordListSlice";
import type { UserWordListFailure } from "../../src/store/userWordListSlice";
import { useUserListAvailable } from "../../src/hooks/useUserListAvailable";
import { useEnsureUserListLoaded } from "../../src/hooks/useUserListLoading";

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

/** Text of a rejected user-list thunk, or a generic fallback. */
function failureText(error: unknown): string {
  const failure = error as Partial<UserWordListFailure> | null;
  return failure && typeof failure.message === "string" && failure.message
    ? failure.message
    : "The request failed.";
}

/**
 * App Settings "My dictionary" section (Feature 96, FR-5, FR-8, FR-11,
 * FR-21, FR-23): the writer's own word list, shared by every project.
 *
 * Needs a Redux `Provider` with the `userWordList` reducer and a
 * `SharingLimitsProvider`. Opening it loads the list once (also with the
 * spelling switch off). On a paired device nothing is loaded and no add path
 * is shown; while the role is unknown nothing is offered either. A failed read
 * shows the reason and Retry, never the empty-state sentence. Add and remove
 * change nothing until the server answers; removal is only offered here.
 */
export default function MyDictionarySettingsTab(): JSX.Element {
  const availability = useUserListAvailable();
  useEnsureUserListLoaded();
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectUserWordListStatus);
  const reason = useAppSelector(selectUserWordListReason);
  const errorMessage = useAppSelector(
    (state: { userWordList: { errorMessage: string } }) =>
      state.userWordList.errorMessage,
  );
  const words = sortIgnoringCase(useAppSelector(selectUserWords));
  const [newWord, setNewWord] = useState<string>("");
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Word whose remove button takes focus; `null` means the heading. */
  const [pendingFocus, setPendingFocus] = useState<{
    word: string | null;
  } | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (!pendingFocus) return;
    const target =
      pendingFocus.word === null
        ? headingRef.current
        : buttonRefs.current.get(pendingFocus.word);
    target?.focus();
    setPendingFocus(null);
  }, [pendingFocus, words]);

  const remove = async (word: string): Promise<void> => {
    setActionError(null);
    try {
      await dispatch(removeFromUserList(word)).unwrap();
      setPendingFocus({ word: focusTargetAfterRemoval(words, word) });
    } catch (err) {
      setActionError(
        `Could not remove ${word} from your dictionary: ${failureText(err)}`,
      );
    }
  };

  const add = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const trimmed = newWord.trim();
    if (!trimmed || isAdding) return;
    setIsAdding(true);
    setActionError(null);
    try {
      await dispatch(addToUserList(trimmed)).unwrap();
      setNewWord("");
    } catch (err) {
      setActionError(
        `Could not add ${trimmed} to your dictionary: ${failureText(err)}`,
      );
    } finally {
      setIsAdding(false);
    }
  };

  const isLoaded = availability === "available" && status === "loaded";
  const title = isLoaded ? `My dictionary (${words.length})` : "My dictionary";

  const renderBody = (): JSX.Element => {
    if (availability === "unavailable") {
      return (
        <p className="text-sm text-gw-secondary">
          My dictionary is not available on this device. Use the project
          dictionary instead.
        </p>
      );
    }
    if (availability === "unknown") {
      return (
        <p className="text-sm text-gw-secondary">
          Checking whether My dictionary is available on this device…
        </p>
      );
    }
    if (status === "failed") {
      return (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-sm font-medium text-gw-primary">
            Your dictionary could not be loaded
            {reason ? ` (${reason})` : ""}.{" "}
            {errorMessage && errorMessage !== reason ? errorMessage : ""}
          </p>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void dispatch(loadUserList())}
            >
              Retry
            </Button>
          </div>
        </div>
      );
    }
    if (status !== "loaded") {
      return <p className="text-sm text-gw-secondary">Loading…</p>;
    }
    return (
      <>
        {words.length === 0 ? (
          <p className="text-sm text-gw-secondary">
            No words in your dictionary yet.
          </p>
        ) : (
          <ul aria-labelledby="my-dictionary-heading" className="space-y-2">
            {words.map((word) => (
              <li
                key={word}
                className="flex items-center justify-between gap-2 rounded-md border-hairline border-gw-border bg-gw-chrome px-3 py-2"
              >
                <span className="text-sm text-gw-primary">{word}</span>
                <Button
                  variant="ghost"
                  aria-label={`Remove ${word} from my dictionary`}
                  ref={(el) => {
                    if (el) buttonRefs.current.set(word, el);
                    else buttonRefs.current.delete(word);
                  }}
                  onClick={() => void remove(word)}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form className="flex flex-col gap-3" onSubmit={(e) => void add(e)}>
          <label
            htmlFor="my-dictionary-new-word"
            className="text-sm font-medium text-gw-primary"
          >
            Add a word
          </label>
          <Input
            id="my-dictionary-new-word"
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
              disabled={!newWord.trim() || isAdding}
            >
              Add word
            </Button>
          </div>
        </form>
      </>
    );
  };

  return (
    <section
      aria-labelledby="my-dictionary-heading"
      className="flex w-full flex-col gap-6"
    >
      <header className="flex flex-col gap-1 border-b border-gw-border pb-4">
        <h2
          id="my-dictionary-heading"
          tabIndex={-1}
          ref={headingRef}
          className="text-lg font-semibold text-gw-primary"
        >
          {title}
        </h2>
        <p className="max-w-2xl text-sm text-gw-secondary">
          Words you added for every project. A word here is not underlined as a
          misspelling. This list is kept on this device or account, not in a
          project.
        </p>
      </header>

      {actionError ? (
        <p role="alert" className="text-sm font-medium text-gw-primary">
          {actionError}
        </p>
      ) : null}

      {renderBody()}
    </section>
  );
}
