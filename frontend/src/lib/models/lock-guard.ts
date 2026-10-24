/**
 * Test-only hook for the lock-order rule (Feature 92, FR-8, FR-9).
 *
 * This module holds one module-level slot and imports nothing. In production
 * the slot stays `null`: `withFileLock` (`file-lock.ts`), `withMetaLock`
 * (`meta-locks.ts`) and `acquireLock` (`locks.ts`) each read it once and, when
 * it is `null`, behave exactly as without it. Nothing here imports
 * `node:async_hooks`: the guard that needs `AsyncLocalStorage` lives in
 * `tests/helpers/lockOrderGuard.ts` and is installed by `tests/setup.ts`.
 * There is no production guard because the native `async_hooks` shim
 * (`src/native-shims/async-hooks.mjs`) does not propagate across `await`.
 */

/** Which lock a hook call is about. */
type GuardedLockKind = "withMetaLock" | "acquireLock" | "withFileLock";

/** Thrown by an installed guard when a lock is taken against FR-8. */
export class LockOrderViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockOrderViolationError";
  }
}

export interface LockGuardHooks {
  /**
   * Called before any lock is taken (a file lock included), with the lock's
   * kind and key. Throws {@link LockOrderViolationError} when a file lock is
   * held by the calling async context.
   */
  beforeLock(kind: GuardedLockKind, key: string): void;
  /** Runs `fn` (the body of a file lock) marked as holding that file lock. */
  runInFileLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

let activeGuard: LockGuardHooks | null = null;

/** Installs (or, with `null`, removes) the guard. Tests only. */
export function installLockGuard(guard: LockGuardHooks | null): void {
  activeGuard = guard;
}

/** The installed guard, or `null` (always `null` outside tests). */
export function getLockGuard(): LockGuardHooks | null {
  return activeGuard;
}
