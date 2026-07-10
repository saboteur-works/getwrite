import fs from "node:fs";
import path from "node:path";
import { computeBacklinks, persistBacklinks } from "./backlinks";
import { getStorageAdapter, runForTenant, type StorageAdapter } from "./io";

/**
 * Options for the backlinks watcher.
 */
export type BacklinkWatcherOptions = {
  /**
   * Milliseconds to debounce rapid file-change events before recomputing.
   * Defaults to 250ms.
   */
  debounceMs?: number;
  /**
   * When true, logs status to console. Default false.
   */
  verbose?: boolean;
};

/**
 * Start a background watcher that recomputes backlinks when files under
 * `<projectRoot>/resources/` change. Returns a function to stop the watcher.
 *
 * Usage:
 *
 * const stop = await startBacklinkWatcher('/path/to/project', { debounceMs: 300 });
 * // later
 * stop();
 */
export function startBacklinkWatcher(
  projectRoot: string,
  opts: BacklinkWatcherOptions = {},
  adapter: StorageAdapter = getStorageAdapter(),
): () => void {
  const debounceMs = opts.debounceMs ?? 250;
  const isVerbose = opts.verbose ?? false;

  const resourcesDir = path.join(projectRoot, "resources");

  let timer: NodeJS.Timeout | null = null;
  let watcher: fs.FSWatcher;

  function scheduleRecompute() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await runForTenant(
          projectRoot,
          async () => {
            if (isVerbose) console.log("backlinks: recomputing...");
            const index = await computeBacklinks(projectRoot);
            await persistBacklinks(projectRoot, index);
            if (isVerbose) console.log("backlinks: persisted");
          },
          adapter,
        );
      } catch (err) {
        // Keep watcher alive on errors but surface to console when verbose
        if (isVerbose) console.error("backlinks: error recomputing", err);
      }
    }, debounceMs);
  }

  function startWatcher() {
    watcher = fs.watch(resourcesDir, { recursive: true }, scheduleRecompute);
  }

  try {
    startWatcher();
  } catch {
    // Directory may not exist yet; create a no-op watcher that retries on first resource creation
    if (isVerbose)
      console.warn(
        "backlinks: resources dir not found, falling back to polling",
      );

    // fallback: poll for existence and then start watcher
    const poll = setInterval(() => {
      if (fs.existsSync(resourcesDir)) {
        clearInterval(poll);
        try {
          startWatcher();
        } catch (e) {
          if (isVerbose) console.error("backlinks: failed to start watcher", e);
        }
      }
    }, 1000);

    // return stop function that clears the poll
    return () => clearInterval(poll);
  }

  // return stop function
  return () => {
    try {
      watcher.close();
    } catch {
      // ignore
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

const backlinkWatcher = { startBacklinkWatcher };
export default backlinkWatcher;
