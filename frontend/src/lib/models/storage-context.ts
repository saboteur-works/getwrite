// Last Updated: 2026-07-08

/**
 * @module storage-context
 *
 * Request/task-scoped storage context, backed by Node's `AsyncLocalStorage`.
 *
 * This module is the seam through which per-request (or per-task) tenant
 * information — a tenant's project root and the {@link StorageAdapter} to
 * resolve filesystem operations against it — flows implicitly through
 * async call stacks, without threading extra parameters through every
 * function signature.
 *
 * Deliberately depends only on the `StorageAdapter` *type* from `io.ts`
 * (no runtime import) to avoid introducing an import cycle between this
 * module and `io.ts` / `projects-dir.ts`.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { StorageAdapter } from "./io";

/**
 * The values scoped to a single request/task: the tenant's project root
 * directory and the storage adapter to use for filesystem operations
 * within that scope.
 */
export type StorageContext = { tenantRoot: string; adapter: StorageAdapter };

/**
 * Module-level `AsyncLocalStorage` instance holding the active
 * {@link StorageContext} for the current async execution chain.
 */
const als = new AsyncLocalStorage<StorageContext>();

/**
 * Runs `fn` with `ctx` bound as the active {@link StorageContext} for the
 * duration of its (possibly asynchronous) execution, including across
 * `await` boundaries within `fn`.
 *
 * @param ctx - The storage context to bind for this invocation.
 * @param fn - The callback to execute within the bound context.
 * @returns Whatever `fn` returns (synchronously or as a `Promise`).
 */
export function runInStorageContext<T>(ctx: StorageContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/**
 * Retrieves the {@link StorageContext} currently bound via
 * {@link runInStorageContext}, if any.
 *
 * @returns The active storage context, or `undefined` when called outside
 * of any `runInStorageContext` scope.
 */
export function getStorageContext(): StorageContext | undefined {
  return als.getStore();
}
