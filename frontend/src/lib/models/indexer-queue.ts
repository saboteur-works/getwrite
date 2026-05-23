import { indexResource } from "./inverted-index";
import { readSidecar } from "./sidecar";
import { listRevisions } from "./revision";
import { readFile } from "./io";
import { loadResourceContent } from "../tiptap-utils";
import { startBacklinkWatcher } from "./backlinks-watcher";
import { computeBacklinks, persistBacklinks } from "./backlinks";
import type { TextResource } from "./types";

type Task = { projectRoot: string; resourceId: string };

const queue: Task[] = [];
let running = false;
let stopped = false;
const activeBacklinkWatchers = new Map<string, () => void>();
let shutdownHooksInstalled = false;

/**
 * Ensures a backlink watcher is running for the project. The watcher
 * debounces file-change events and persists meta/backlinks.json. Started
 * lazily on first enqueueIndex so the runtime backlink index is kept in
 * sync without callers having to manage watcher lifecycle.
 */
function ensureBacklinkWatcher(projectRoot: string): void {
  if (activeBacklinkWatchers.has(projectRoot)) return;
  try {
    const stop = startBacklinkWatcher(projectRoot);
    activeBacklinkWatchers.set(projectRoot, stop);
  } catch {
    // Watcher could not start (e.g. resources dir missing on cold start) —
    // leave the slot empty so a later enqueue can retry.
  }
}

/**
 * Installs SIGTERM/SIGINT/beforeExit handlers that drain the indexer queue
 * before the process exits. Idempotent; safe to call from any enqueue path.
 * The hooks call {@link shutdownIndexer} and then `process.exit(0)` so the
 * Next.js server can gracefully wind down when Electron's `before-quit`
 * sends a termination signal to the spawned child.
 */
export function installShutdownHooks(): void {
  if (shutdownHooksInstalled) return;
  shutdownHooksInstalled = true;
  const handle = (signal: NodeJS.Signals | "beforeExit") => () => {
    void shutdownIndexer().finally(() => {
      if (signal !== "beforeExit") process.exit(0);
    });
  };
  process.on("SIGTERM", handle("SIGTERM"));
  process.on("SIGINT", handle("SIGINT"));
  process.on("beforeExit", handle("beforeExit"));
}

async function runTask(t: Task) {
  try {
    const side = await readSidecar(t.projectRoot, t.resourceId);
    const now = new Date().toISOString();

    // Try to obtain canonical plain text from resource storage first
    let plain: string | undefined;
    try {
      const loaded = await loadResourceContent(t.projectRoot, t.resourceId);
      plain = loaded.plainText ?? undefined;
      if (!plain && loaded.tiptap)
        plain =
          (loaded.tiptap as any) && loaded.tiptap
            ? await Promise.resolve(
                (await import("../tiptap-utils")).tiptapToPlainText(
                  loaded.tiptap as any,
                ),
              )
            : undefined;
    } catch (_) {
      // ignore
    }

    // Fallback: read last revision content (content.bin) if present
    if (!plain) {
      try {
        const revs = await listRevisions(t.projectRoot, t.resourceId);
        if (revs.length > 0) {
          const last = revs[revs.length - 1];
          if (last.filePath) {
            try {
              plain = await readFile(last.filePath, "utf8");
            } catch (_) {
              // ignore read errors
            }
          }
        }
      } catch (_) {
        // ignore
      }
    }

    const minimal: TextResource = {
      id: t.resourceId,
      name: (side && (side as any).name) || t.resourceId,
      slug: (side && (side as any).slug) || undefined,
      type: "text",
      folderId: undefined,
      createdAt: now,
      plainText: plain,
      tiptap: undefined,
    } as unknown as TextResource;

    await indexResource(t.projectRoot, minimal);

    try {
      const backlinks = await computeBacklinks(t.projectRoot);
      await persistBacklinks(t.projectRoot, backlinks);
    } catch (err) {
      console.error("[indexer-queue] backlinks update failed:", err);
    }
  } catch (err) {
    console.error("[indexer-queue] task failed:", err);
  }
}

async function processQueue() {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const t = queue.shift()!;
    // process sequentially to avoid concurrent fs stress
    // don't let a single failure stop the queue
    try {
      // eslint-disable-next-line no-await-in-loop
      await runTask(t);
    } catch (err) {
      console.error("[indexer-queue] processQueue error:", err);
    }
  }
  running = false;
}

/** Enqueue a resource id for indexing. Returns a Promise that resolves when the task has been processed. */
export function enqueueIndex(
  projectRoot: string,
  resourceId: string,
): Promise<void> {
  if (stopped) {
    // After shutdown, accept no new work. Resolve immediately so callers
    // (e.g. background save handlers) don't hang the request.
    return Promise.resolve();
  }
  installShutdownHooks();
  ensureBacklinkWatcher(projectRoot);
  return new Promise((resolve) => {
    queue.push({ projectRoot, resourceId });
    // Kick the processor asynchronously
    void processQueue();
    // Poll for task completion by waiting until resourceId no longer in queue
    const interval = setInterval(() => {
      const pending = queue.find((q) => q.resourceId === resourceId);
      if (!pending && !running) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
    // Also resolve after a reasonable timeout to avoid hanging tests
    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, 5000);
  });
}

/** Wait until the queue is drained (or timeout) — useful for tests and graceful shutdown. */
export function flushIndexer(timeout = 5000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (queue.length === 0 && !running) {
        clearInterval(iv);
        resolve();
        return;
      }
      if (Date.now() - start > timeout) {
        clearInterval(iv);
        resolve();
      }
    }, 25);
  });
}

/** Alias for {@link flushIndexer} — standard drain API. */
export const waitForDrain = flushIndexer;

/**
 * Gracefully shuts down the indexer queue. Stops accepting new tasks,
 * waits for any in-flight or queued tasks to finish (up to `timeoutMs`),
 * and stops all backlinks watchers started by this module.
 *
 * Calling more than once is safe — additional calls await the original
 * drain without re-stopping watchers.
 */
export async function shutdownIndexer(timeoutMs = 5000): Promise<void> {
  stopped = true;
  try {
    await flushIndexer(timeoutMs);
  } finally {
    for (const stop of activeBacklinkWatchers.values()) {
      try {
        stop();
      } catch {
        // ignore individual watcher errors during shutdown
      }
    }
    activeBacklinkWatchers.clear();
  }
}

/**
 * Test-only helper that resets the stopped flag so a fresh enqueue path can
 * be exercised after a `shutdownIndexer` call. Not exported via default.
 */
export function __resetIndexerForTests(): void {
  stopped = false;
  queue.length = 0;
  running = false;
  for (const stop of activeBacklinkWatchers.values()) {
    try {
      stop();
    } catch {
      // ignore
    }
  }
  activeBacklinkWatchers.clear();
}

export default {
  enqueueIndex,
  flushIndexer,
  waitForDrain,
  shutdownIndexer,
  installShutdownHooks,
};
