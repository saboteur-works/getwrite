/**
 * @module store/transport/native-trash-backend.web-stub
 *
 * **ADR-021 seam — web-build substitute.** Mirrors
 * `native-entity-relationships-backend.web-stub.ts`. Turbopack cannot
 * statically prove that `lib/api/trash.ts`'s
 * `await import("../../store/transport/native-trash-backend")` branch is
 * unreachable in the hosted/desktop build (the branch's guard is a runtime
 * env comparison, and Turbopack resolves dynamic `import()` targets into
 * the module graph regardless of surrounding control flow).
 *
 * Unlike most of this family, the *real* `native-trash-backend.ts` doesn't
 * yet import anything Turbopack-unsafe (its implementation is deferred and
 * every method just rejects) — but this stub still exists to keep the
 * substitution pattern uniform ahead of the later task that fills in the
 * real backend with the same `node:*`-importing model-layer calls every
 * other native backend makes, at which point this stub becomes load-bearing
 * the same way its siblings already are.
 *
 * This stub is never actually invoked: `resolveTrashTransport()` only calls
 * into the native branch when `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`,
 * which is never true for the hosted/desktop builds this alias applies to.
 *
 * Tests and `tsc` resolve the *real* `native-trash-backend.ts` directly
 * (this alias is a Turbopack-only resolution rule, not a TypeScript path or
 * module remap), so this stub does not affect type coverage or test
 * behavior.
 */
import type { TrashTransport } from "../../lib/api/trash";

/**
 * Same export shape as the real module's factory, so Turbopack's substitute
 * module is structurally compatible. Throws if ever actually reached, which
 * would only happen if the build-time exclusion above stopped applying.
 */
export function createNativeTrashTransport(): TrashTransport {
  throw new Error(
    "native-trash-backend.web-stub: the native trash transport was " +
      "reached in a web/desktop build. This stub replaces the real native " +
      "backend via next.config.mjs's turbopack.resolveAlias and should " +
      "never be invoked — see this file's module doc.",
  );
}
