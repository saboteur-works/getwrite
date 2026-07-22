// Last Updated: 2026-07-10

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
 * The `tenantRoot` used here is resolved per-request by
 * `resolveTenant(request)` (`app/api/_tenant/resolve-tenant.ts`; ADR-018), not by
 * calling `resolveProjectsDir()` directly — doing that here would read the
 * very context this helper is responsible for establishing, which doesn't
 * exist yet at this point in the call stack. For an unauthenticated / no-account
 * request (the Electron/local-dev case), `resolveTenant` resolves `tenantRoot`
 * to `defaultProjectsDir()`, preserving byte-identical legacy behavior. For a
 * signed-in request, it resolves to that user's validated, provisioned
 * per-tenant data root instead.
 */
import { runInStorageContext } from "../../../src/lib/models/storage-context";
import { defaultProjectsDir } from "../../../src/lib/models/projects-dir";
import { resolveTenant } from "./resolve-tenant";
import { resolveBackendAdapter } from "./storage-backend";

/**
 * Wraps a Next.js route handler of any arity (`GET()`, `POST(req)`,
 * `GET(req, { params })`, etc.) so that, before the handler runs, a
 * {@link StorageContext} is established for the duration of its
 * (possibly asynchronous) execution.
 *
 * The wrapper is itself asynchronous: it extracts the inbound request as
 * `args[0]` (Next.js always passes it, even to handlers that appear
 * zero-arity) and awaits `resolveTenant(request)` to determine `tenantRoot`
 * before entering the storage context. The request is narrowed with
 * `instanceof Request` rather than an unchecked cast, so anything that is not
 * a `Request` — a handler invoked directly with no/other arguments, which
 * should not occur via Next.js routing but must not crash — safely falls back
 * to `defaultProjectsDir()` without calling `resolveTenant`, matching the
 * null-user behavior.
 *
 * Preserves the handler's exact call signature and return type so Next.js's
 * route-handler type inference continues to accept the wrapped export.
 *
 * @param handler - The route handler to wrap.
 * @returns A handler with an identical signature that runs `handler` inside
 * a freshly established storage context.
 */
export function withStorageContext<Args extends unknown[], Return>(
  handler: (...args: Args) => Return | Promise<Return>,
): (...args: Args) => Promise<Return> {
  return async (...args: Args) => {
    const request = args[0];

    // Both halves of the context are resolved per-request: `tenantRoot` (the
    // path prefix) and `adapter` (the storage backend, ADR-019). For a real
    // request both come from `resolveTenant`; the non-Request defensive branch
    // (which Next.js routing should never hit) still honors the backend env.
    if (request instanceof Request) {
      const { dataRoot, adapter } = await resolveTenant(request);
      return await runInStorageContext({ tenantRoot: dataRoot, adapter }, () =>
        handler(...args),
      );
    }

    return await runInStorageContext(
      { tenantRoot: defaultProjectsDir(), adapter: resolveBackendAdapter() },
      () => handler(...args),
    );
  };
}
