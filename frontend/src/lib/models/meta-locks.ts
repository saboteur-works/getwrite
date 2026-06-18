/**
 * Promise-chaining serializer for metadata-affecting operations.
 *
 * Unlike `locks.ts` (a queue-based mutex that tracks waiters), this module uses
 * a simpler promise-chain pattern: each new operation is chained onto the tail
 * of the previous one via `.then()`, and the map entry is replaced with the
 * newly extended chain. Operations within the same project run in arrival order
 * with no concurrency.
 */
const locks: Map<string, Promise<void>> = new Map();

export async function withMetaLock<T>(
  projectRoot: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = projectRoot || "global";
  const prev = locks.get(key) ?? Promise.resolve();

  // Chain the new operation after previous
  const next = prev.then(() => fn());

  // Store a void-settled promise so the map entry never carries a rejection.
  // If a caller ignores the returned promise, a rejected stored entry would
  // surface as an unhandled rejection — `.catch(() => undefined)` prevents that.
  locks.set(
    key,
    next.then(() => undefined).catch(() => undefined),
  );

  try {
    return await next;
  } finally {
    // If the stored promise is the one we created, delete it
    const stored = locks.get(key);
    if (stored && stored === (next as unknown as Promise<void>)) {
      locks.delete(key);
    }
  }
}

const metaLocks = { withMetaLock };
export default metaLocks;
