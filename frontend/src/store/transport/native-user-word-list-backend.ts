/**
 * @module store/transport/native-user-word-list-backend
 *
 * In-process user-word-list backend for a native (Capacitor) build:
 * delegates to `lib/models/native-user-word-list.ts`, which reads and writes
 * the single device file directly. Not built on `createNativeRunner`: the
 * list has no project id and no `StorageContext` (same reasoning as
 * `native-global-noise-words-backend.ts`). Errors propagate; a failed read
 * never surfaces as an empty list.
 *
 * Imported only on the native path (the client transport's dynamic import);
 * `next.config.mjs` aliases it to a `node:*`-free web-stub in web/desktop
 * builds.
 */
import {
  addNativeUserWord,
  getNativeUserWords,
  removeNativeUserWord,
} from "../../lib/models/native-user-word-list";

/** The three operations the native backend offers; each resolves to the persisted list. */
export interface NativeUserWordListTransport {
  getUserWords(): Promise<string[]>;
  addUserWord(word: string): Promise<string[]>;
  removeUserWord(word: string): Promise<string[]>;
}

/** Builds the in-process user-word-list transport for a native build. */
export function createNativeUserWordListTransport(): NativeUserWordListTransport {
  return {
    getUserWords: () => getNativeUserWords(),
    addUserWord: (word) => addNativeUserWord(word),
    removeUserWord: (word) => removeNativeUserWord(word),
  };
}
