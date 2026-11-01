// Last Updated: 2026-11-01

/**
 * @module pending-saves
 *
 * Every editor save that is waiting or running, so the desktop app can finish
 * them before its window closes. Without this, a save still waiting out the
 * autosave delay was lost when the window closed or the app quit
 * (specs/features/window-close-save.md).
 */

/**
 * `queued` flushers send saves waiting out the rich-text autosave delay.
 * `source` flushers send Markdown edits, which are newer than anything queued,
 * so they go only after the queued saves have finished.
 */
export type SaveFlusherStage = "queued" | "source";

const flushers: Record<SaveFlusherStage, Set<() => void>> = {
  queued: new Set(),
  source: new Set(),
};
const running = new Set<Promise<boolean>>();

/**
 * Registers a function that sends any save it is holding.
 *
 * @param stage - When the flusher runs; see {@link SaveFlusherStage}.
 * @param flusher - Sends the held save; started saves go through {@link trackSave}.
 * @returns Removes the flusher.
 */
export function registerSaveFlusher(
  stage: SaveFlusherStage,
  flusher: () => void,
): () => void {
  flushers[stage].add(flusher);
  return () => {
    flushers[stage].delete(flusher);
  };
}

/**
 * Records a running save until it settles.
 *
 * @param save - Resolves `true` when the save landed; a rejection counts as failed.
 */
export function trackSave(save: Promise<boolean>): void {
  const tracked = save.catch(() => false);
  running.add(tracked);
  void tracked.finally(() => {
    running.delete(tracked);
  });
}

async function runStage(stage: SaveFlusherStage): Promise<boolean> {
  flushers[stage].forEach((flusher) => flusher());
  const results = await Promise.all(running);
  return results.every(Boolean);
}

/**
 * Sends every held save and waits for all saves to settle.
 *
 * @returns `true` when every save landed, or there was nothing to save.
 */
export async function flushPendingSaves(): Promise<boolean> {
  const isQueuedSaved = await runStage("queued");
  const isSourceSaved = await runStage("source");
  return isQueuedSaved && isSourceSaved;
}
