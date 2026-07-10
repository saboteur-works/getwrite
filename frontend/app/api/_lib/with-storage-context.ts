// Last Updated: 2026-07-08

/**
 * @module with-storage-context
 *
 * The sanctioned seam for establishing a request-scoped {@link StorageContext}
 * around a Next.js App Router route handler.
 *
 * Routes that resolve the projects directory (via `resolveProjectsDir()`)
 * must establish a `StorageContext` before that resolution runs, or it falls
 * back to `defaultProjectsDir()`'s legacy env/cwd rules. Rather than
 * duplicating a `runInStorageContext(...)` call inline in every such route
 * handler — or introducing a `middleware.ts` (this repo has none, and this
 * feature does not add one) — route authors wrap their exported handler with
 * {@link withStorageContext} once, at the export site.
 *
 * The `tenantRoot` used here is deliberately `defaultProjectsDir()` (the
 * legacy, context-blind resolution), not `resolveProjectsDir()` — calling
 * `resolveProjectsDir()` here would read the very context this helper is
 * responsible for establishing, which doesn't exist yet at this point in the
 * call stack. This keeps behavior byte-identical to the pre-existing
 * resolution until a future auth spec swaps in a genuinely per-tenant
 * `tenantRoot` for this call.
 */
import { runInStorageContext } from "../../../src/lib/models/storage-context";
import { defaultProjectsDir } from "../../../src/lib/models/projects-dir";
import { getStorageAdapter } from "../../../src/lib/models/io";

/**
 * Wraps a Next.js route handler of any arity (`GET()`, `POST(req)`,
 * `GET(req, { params })`, etc.) so that, before the handler runs, a
 * {@link StorageContext} is established for the duration of its
 * (possibly asynchronous) execution.
 *
 * Preserves the handler's exact call signature and return type so Next.js's
 * route-handler type inference continues to accept the wrapped export.
 *
 * @param handler - The route handler to wrap.
 * @returns A handler with an identical signature that runs `handler` inside
 * a freshly established storage context.
 */
export function withStorageContext<Args extends unknown[], Return>(
  handler: (...args: Args) => Return,
): (...args: Args) => Return {
  return (...args: Args) =>
    runInStorageContext(
      { tenantRoot: defaultProjectsDir(), adapter: getStorageAdapter() },
      () => handler(...args),
    );
}
