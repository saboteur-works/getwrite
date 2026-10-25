/**
 * @module create-spell-worker
 *
 * Creates the real spell-check worker for `createSpellClient` (FR-21). The
 * `new Worker(new URL(...))` form is what makes the bundler build
 * `spell.worker.ts` as its own script; the worker is classic (no `type`
 * option), as the Decision records.
 */
import type { SpellWorkerLike } from "./spell-client";

export function createSpellWorker(): SpellWorkerLike {
  const worker = new Worker(new URL("./spell.worker.ts", import.meta.url));
  const adapted: SpellWorkerLike = {
    postMessage: (message) => worker.postMessage(message),
    terminate: () => worker.terminate(),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  };
  worker.onmessage = (event) => adapted.onmessage?.(event);
  worker.onerror = (event) => adapted.onerror?.(event);
  worker.onmessageerror = (event) => adapted.onmessageerror?.(event);
  return adapted;
}
