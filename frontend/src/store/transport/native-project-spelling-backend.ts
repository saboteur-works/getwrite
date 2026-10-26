/**
 * @module store/transport/native-project-spelling-backend
 *
 * In-process {@link ProjectSpellingTransport} for a native (Capacitor)
 * build: runs the same core the HTTP route uses
 * (`project-spelling-core.ts`) inside the native storage context. Word
 * validation, the list bound and projectId checks live in that core, so the
 * same bad input throws the same error here as it maps to a 4xx on the route.
 *
 * Every error propagates rather than degrading: a failed read must never
 * surface as empty lists (`docs/standards/failure-visibility.md`).
 *
 * Imported only on the native path (`lib/api/project-spelling.ts`'s dynamic
 * import); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import {
  addSpellingWordCore,
  getSpellingListsCore,
  ignoreSpellingWordCore,
  removeSpellingWordCore,
  unignoreSpellingWordCore,
} from "../../lib/models/project-spelling-core";
import type { ProjectSpellingTransport } from "../../lib/api/project-spelling";

/**
 * Builds the in-process project-spelling transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeProjectSpellingTransport(
  deps: NativeBackendDeps = {},
): ProjectSpellingTransport {
  const run = createNativeRunner(deps);
  return {
    getSpellingLists: (projectId) => run(() => getSpellingListsCore(projectId)),
    addSpellingWord: (projectId, word) =>
      run(() => addSpellingWordCore(projectId, word)),
    removeSpellingWord: (projectId, word) =>
      run(() => removeSpellingWordCore(projectId, word)),
    ignoreSpellingWord: (projectId, word) =>
      run(() => ignoreSpellingWordCore(projectId, word)),
    unignoreSpellingWord: (projectId, word) =>
      run(() => unignoreSpellingWordCore(projectId, word)),
  };
}
