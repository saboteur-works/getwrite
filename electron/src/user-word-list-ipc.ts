/**
 * User word list IPC handlers (Feature 96, Task 7; FR-1, FR-2, FR-13, FR-19,
 * FR-22).
 *
 * The desktop store for the writer's own spelling words, kept in
 * `<userDataDir>/user-word-list.json` as a plain JSON array of strings,
 * separate from `workspace.json` and the global noise-word list. Each handler
 * checks the sender first, then validates the word, then does a synchronous
 * read-modify-write (no `await` between the read and the write, so two calls
 * in sequence cannot lose a word). The renderer never supplies a path.
 *
 * No `electron` import. `electron/src` is compiled with `rootDir: "src"` and
 * cannot import `frontend/src/lib/models/user-word-list-core.ts`, so the word
 * rules are restated below with the same bounds and reasons; a test runs both
 * over the same inputs so they cannot drift unnoticed.
 *
 * A failure is never returned as an empty list: an unreadable file gives
 * `{ ok: false, reason: "unreadable" }` and is left untouched.
 */
import fs from "fs";
import path from "path";
import { writeFileViaTemporary } from "./projects-dir";

/** File name inside `userData`; distinct from `workspace.json`. */
export const USER_WORD_LIST_FILENAME = "user-word-list.json";

const MAX_WORD_LENGTH = 100;
const MAX_LIST_SIZE = 5000;
const INNER_WHITESPACE = /\s/u;
const CONTROL_CHARACTER = /\p{Cc}/u;

/** Why a call was refused or failed. */
type UserWordListFailureReason =
  | "invalid-word"
  | "too-long"
  | "list-full"
  | "unreadable"
  | "write-failed";

/** The persisted list, or why the call did not succeed. */
export type UserWordListResult =
  | { ok: true; words: string[] }
  | { ok: false; reason: UserWordListFailureReason; message: string };

export interface UserWordListHandlerDeps {
  /** `app.getPath("userData")`; used exactly as given. */
  userDataDir: string;
  log: (message: string) => void;
  /** True only for a sender URL on the local origin (`navigation-guard.ts`). */
  isTrustedSender: (url: string | null | undefined) => boolean;
}

/** The part of an IPC event the sender check reads. */
interface UserWordListSenderEvent {
  senderFrame?: { url?: string | null } | null;
}

export interface UserWordListHandlers {
  get(event: UserWordListSenderEvent): UserWordListResult;
  add(event: UserWordListSenderEvent, word: unknown): UserWordListResult;
  remove(event: UserWordListSenderEvent, word: unknown): UserWordListResult;
}

function fail(
  reason: UserWordListFailureReason,
  message: string,
): UserWordListResult {
  return { ok: false, reason, message };
}

type WordCheck =
  | { ok: true; word: string }
  | { ok: false; result: UserWordListResult };

function checkWord(word: unknown): WordCheck {
  const invalid = fail(
    "invalid-word",
    "The word must be a string with no whitespace or control characters",
  );
  if (typeof word !== "string") return { ok: false, result: invalid };
  const normalised = word.normalize("NFC").trim();
  if (normalised.length > MAX_WORD_LENGTH) {
    return {
      ok: false,
      result: fail("too-long", "The word is too long for the word list"),
    };
  }
  if (
    normalised.length === 0 ||
    INNER_WHITESPACE.test(normalised) ||
    CONTROL_CHARACTER.test(normalised)
  ) {
    return { ok: false, result: invalid };
  }
  return { ok: true, word: normalised };
}

const fold = (word: string): string => word.normalize("NFC").toLowerCase();

type StoredList =
  | { ok: true; words: string[] }
  | { ok: false; result: UserWordListResult };

function readStored(filePath: string): StoredList {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, words: [] };
    }
    return {
      ok: false,
      result: fail("unreadable", "The word list file could not be read"),
    };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      Array.isArray(parsed) &&
      parsed.every((word) => typeof word === "string")
    ) {
      return { ok: true, words: parsed as string[] };
    }
  } catch {
    // Fall through to the same refusal as a wrong shape.
  }
  return {
    ok: false,
    result: fail("unreadable", "The word list file is damaged"),
  };
}

/**
 * Builds the get, add and remove handlers for the user word list.
 *
 * @param deps - The `userData` directory, a logger and the sender check.
 * @returns Handlers that throw on an untrusted sender and otherwise return a
 *   result object (never throw for a word or file problem).
 */
export function createUserWordListHandlers(
  deps: UserWordListHandlerDeps,
): UserWordListHandlers {
  const filePath = path.join(deps.userDataDir, USER_WORD_LIST_FILENAME);

  // Sender first, before the payload or the file is looked at (FR-22).
  const assertTrusted = (event: UserWordListSenderEvent): void => {
    if (!deps.isTrustedSender(event.senderFrame?.url)) {
      throw new Error("Refused: untrusted sender");
    }
  };

  const persist = (words: string[]): UserWordListResult => {
    try {
      fs.mkdirSync(deps.userDataDir, { recursive: true });
      writeFileViaTemporary(filePath, `${JSON.stringify(words, null, 2)}\n`);
      return { ok: true, words };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.log(`Failed to save the user word list: ${message}`);
      return fail("write-failed", "The word list could not be saved");
    }
  };

  return {
    get: (event) => {
      assertTrusted(event);
      const stored = readStored(filePath);
      return stored.ok ? { ok: true, words: stored.words } : stored.result;
    },
    add: (event, word) => {
      assertTrusted(event);
      const checked = checkWord(word);
      if (!checked.ok) return checked.result;
      const stored = readStored(filePath);
      if (!stored.ok) return stored.result;
      const folded = fold(checked.word);
      if (stored.words.some((w) => fold(w) === folded)) {
        return { ok: true, words: stored.words };
      }
      if (stored.words.length >= MAX_LIST_SIZE) {
        return fail(
          "list-full",
          `The word list is full (${MAX_LIST_SIZE} words)`,
        );
      }
      return persist([...stored.words, checked.word]);
    },
    remove: (event, word) => {
      assertTrusted(event);
      const checked = checkWord(word);
      if (!checked.ok) return checked.result;
      const stored = readStored(filePath);
      if (!stored.ok) return stored.result;
      const folded = fold(checked.word);
      const next = stored.words.filter((w) => fold(w) !== folded);
      if (next.length === stored.words.length) {
        return { ok: true, words: stored.words };
      }
      return persist(next);
    },
  };
}
