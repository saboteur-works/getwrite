/**
 * @module store/transport/native-global-noise-words-backend
 *
 * In-process {@link GlobalNoiseWordsTransport} for a native (Capacitor)
 * build: delegates directly to `lib/models/native-global-noise-words.ts`'s
 * `getNativeGlobalNoiseWords`/`setNativeGlobalNoiseWords`, which talk
 * straight to the raw Capacitor Filesystem plugin for a single,
 * project-independent device file.
 *
 * Deliberately **not** built on `native-runner.ts`'s `createNativeRunner`:
 * that helper binds a `StorageContext` (tenant root + adapter) for cores
 * that read/write project-scoped files, but the global noise-word list has
 * no project id in its path and is read/written outside
 * `io.ts`/`storage-context.ts` entirely (see `native-global-noise-words.ts`'s
 * own header comment) — there is no storage context for this backend to
 * bind, so it calls straight through.
 *
 * Imported only on the native path (`lib/api/global-noise-words.ts`'s
 * dynamic import); `next.config.mjs` aliases it to a `node:*`-free web-stub
 * in web/desktop builds.
 */
import {
  getNativeGlobalNoiseWords,
  setNativeGlobalNoiseWords,
} from "../../lib/models/native-global-noise-words";
import type { GlobalNoiseWordsTransport } from "../../lib/api/global-noise-words";

/** Builds the in-process global-noise-words transport for a native build. */
export function createNativeGlobalNoiseWordsTransport(): GlobalNoiseWordsTransport {
  return {
    getGlobalNoiseWords: () => getNativeGlobalNoiseWords(),
    async setGlobalNoiseWords(words) {
      await setNativeGlobalNoiseWords(words);
      return words;
    },
  };
}
