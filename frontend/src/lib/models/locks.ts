// Lightweight per-key async mutex.
// Usage: const release = await acquireLock(key); try { ... } finally { release(); }
const queues = new Map<string, Array<() => void>>();

function makeRelease(key: string): () => void {
  let isReleased = false;
  return () => {
    if (isReleased) return;
    isReleased = true;
    const cur = queues.get(key);
    if (cur && cur.length > 0) {
      const next = cur.shift();
      if (next) next();
    } else {
      queues.delete(key);
    }
  };
}

export async function acquireLock(key: string): Promise<() => void> {
  return new Promise<() => void>((resolve) => {
    const q = queues.get(key);
    if (!q) {
      // No queue -> create and grant lock immediately
      queues.set(key, []);
      resolve(makeRelease(key));
    } else {
      // Enqueue resolver to be called when previous releases
      q.push(() => resolve(makeRelease(key)));
    }
  });
}

const lockApi = { acquireLock };
export default lockApi;
