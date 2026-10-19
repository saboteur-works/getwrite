/**
 * Global noise-word IPC handlers (Feature 88, Task 7; FR-9, FR-10).
 *
 * No `electron` import: the user-data directory arrives as an argument, like
 * `createDeviceHandlers`, so the handlers can be tested without Electron and
 * never fall back to an empty path.
 */
import { readGlobalNoiseWords, writeGlobalNoiseWords } from "./projects-dir";

/** What persisting a new global noise-word list can result in. */
export type GlobalNoiseWordsSetResult =
  | { ok: true }
  | { ok: false; message: string };

export interface GlobalNoiseWordsHandlerDeps {
  /** Directory holding `workspace.json`; used exactly as given. */
  userDataDir: string;
  log: (message: string) => void;
  /** True only for a sender URL on the local origin (`navigation-guard.ts`). */
  isTrustedSender: (url: string | null | undefined) => boolean;
}

/** The part of an IPC event the sender check reads. */
export interface NoiseWordsSenderEvent {
  senderFrame?: { url?: string | null } | null;
}

export interface GlobalNoiseWordsHandlers {
  get(event: NoiseWordsSenderEvent): string[];
  set(event: NoiseWordsSenderEvent, words: unknown): GlobalNoiseWordsSetResult;
}

/**
 * Builds the get and set handlers for the global noise-word list stored in
 * `<userDataDir>/workspace.json`.
 *
 * @param deps - The directory to use and a logger for failed writes.
 * @returns The two handlers; `set` returns the failure message rather than
 *   throwing, and logs it.
 */
export function createGlobalNoiseWordsHandlers(
  deps: GlobalNoiseWordsHandlerDeps,
): GlobalNoiseWordsHandlers {
  // Sender first, then payload, as the sharing handlers do (POS
  // note_56d253e9): only the app's own window may read or replace the list.
  const assertTrusted = (event: NoiseWordsSenderEvent): void => {
    if (!deps.isTrustedSender(event.senderFrame?.url)) {
      throw new Error("Refused: untrusted sender");
    }
  };
  return {
    get: (event): string[] => {
      assertTrusted(event);
      return readGlobalNoiseWords(deps.userDataDir);
    },
    set: (event, words): GlobalNoiseWordsSetResult => {
      assertTrusted(event);
      if (
        !Array.isArray(words) ||
        !words.every((word) => typeof word === "string")
      ) {
        return { ok: false, message: "Invalid noise-word list" };
      }
      try {
        writeGlobalNoiseWords(deps.userDataDir, words);
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deps.log(`Failed to save the global noise-word list: ${message}`);
        return { ok: false, message };
      }
    },
  };
}
