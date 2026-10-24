/**
 * Feature 92, Task 23: the test-only lock-order guard (FR-8, FR-9).
 *
 * Installed for every test file by `tests/setup.ts`. A real
 * `AsyncLocalStorage` marks the async context of a running file-lock body;
 * any lock taken from that context (`withFileLock` of the same or another
 * file, `withMetaLock`, `acquireLock`) throws `LockOrderViolationError`
 * instead of waiting. `node:async_hooks` is imported here and not in
 * `src/lib/models/lock-guard.ts`, so no production bundle reaches it.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import {
  installLockGuard,
  LockOrderViolationError,
  type LockGuardHooks,
} from "../../src/lib/models/lock-guard";

const held = new AsyncLocalStorage<string>();
/** Meta-lock keys held by the calling async context (Feature 93, FR-17). */
const heldMeta = new AsyncLocalStorage<ReadonlySet<string>>();

/**
 * Runs `fn` as a separate request would: outside the file lock whose body is
 * calling it. For a test that starts a second, independent operation from
 * inside a lock body (to race it against the lock holder). It also runs
 * outside any `withMetaLock` callback marked by the guard (Feature 93, FR-17). Production code
 * has no such call; this is not a way around the rule for it.
 */
export function outsideFileLock<T>(fn: () => T): T {
  return held.exit(() => heldMeta.exit(fn));
}

export function createLockOrderGuard(): LockGuardHooks {
  return {
    beforeLock(kind, key) {
      if (kind === "withMetaLock" && heldMeta.getStore()?.has(key)) {
        throw new LockOrderViolationError(
          `withMetaLock(${key}) taken inside a withMetaLock callback for the same key`,
        );
      }
      const heldKey = held.getStore();
      if (heldKey === undefined) return;
      throw new LockOrderViolationError(
        `${kind}(${key}) taken while the file lock for ${heldKey} is held`,
      );
    },
    runInFileLock(key, fn) {
      return held.run(key, fn);
    },
    runInMetaLock(key, fn) {
      return heldMeta.run(new Set([...(heldMeta.getStore() ?? []), key]), fn);
    },
  };
}

/** Installs the guard; returns a function that removes it. */
export function installLockOrderGuard(): () => void {
  installLockGuard(createLockOrderGuard());
  return () => installLockGuard(null);
}
