/**
 * @module store/transport/native-trash-backend
 *
 * **trash-ui later-task seam, created early (Task 12).** Reserves the
 * literal dynamic-import specifier `lib/api/trash.ts`'s
 * `resolveTrashTransport` uses, for the same reason
 * `native-entity-relationships-backend.ts` was created ahead of its own
 * implementing task: Turbopack/Vite resolve a dynamic `import()`'s literal
 * specifier into the module graph regardless of whether the runtime branch
 * that reaches it is ever taken, so `vitest` and `tsc --noEmit` both need a
 * real module at this path to resolve at all.
 *
 * The real in-process native implementation of {@link TrashTransport} —
 * mirroring the model-layer functions in `lib/models/trash.ts` the way
 * `native-entity-relationships-backend.ts` mirrors
 * `lib/models/entity-relationships.ts` — is explicitly OUT OF SCOPE for this
 * task and deferred to a later one. Every method here rejects with a clear
 * "not supported on this platform" error instead.
 */
import type { TrashTransport } from "../../lib/api/trash";

const NOT_SUPPORTED_MESSAGE =
  "Trash is not supported on this platform yet: the native trash transport " +
  "has not been implemented (deferred follow-up work — see " +
  "native-trash-backend.ts's module doc).";

/**
 * Builds the (currently stubbed) in-process trash transport for a native
 * build. Every method rejects; there is no working native trash support
 * yet.
 */
export function createNativeTrashTransport(): TrashTransport {
  return {
    list() {
      return Promise.reject(new Error(NOT_SUPPORTED_MESSAGE));
    },
    restore() {
      return Promise.reject(new Error(NOT_SUPPORTED_MESSAGE));
    },
    purge() {
      return Promise.reject(new Error(NOT_SUPPORTED_MESSAGE));
    },
  };
}
