/**
 * @module spell-client.test-double
 *
 * Test doubles for the spell-check seam (Task 30). `createTestDoubleEngine`
 * is a `SpellEngine` that records its calls and can be told to fail.
 * `createDeferredWorker` is a worker that hosts the real worker-side handler
 * but holds work until `process()` and replies until `release()`, so a test
 * decides the order in which things happen.
 */
import type { SpellEngine } from "./engine";
import type { SpellWorkerLike } from "./spell-client";
import {
  createWorkerHandler,
  type WorkerReply,
  type WorkerRequest,
} from "./worker-protocol";

export interface TestDoubleEngineOptions {
  /** Words (lower case) the engine treats as correct. */
  known?: string[];
  /** Suggestions returned for any word. */
  suggestions?: string[];
  loadError?: Error;
  checkError?: Error;
  suggestError?: Error;
}

export interface TestDoubleEngine extends SpellEngine {
  /** Every call made on the engine, in order, e.g. `load`, `isCorrect:wrng`. */
  calls: string[];
}

export function createTestDoubleEngine(
  options: TestDoubleEngineOptions = {},
): TestDoubleEngine {
  const known = new Set((options.known ?? []).map((w) => w.toLowerCase()));
  const calls: string[] = [];
  return {
    calls,
    async load() {
      calls.push("load");
      if (options.loadError) throw options.loadError;
    },
    isCorrect(word) {
      calls.push(`isCorrect:${word}`);
      if (options.checkError) throw options.checkError;
      return known.has(word.toLowerCase());
    },
    suggest(word, max) {
      calls.push(`suggest:${word}`);
      if (options.suggestError) throw options.suggestError;
      return (options.suggestions ?? []).slice(0, max);
    },
  };
}

export interface DeferredWorker extends SpellWorkerLike {
  /** Every request the client posted, in order. */
  posted: WorkerRequest[];
  terminated: boolean;
  /** Runs every queued request through the handler; replies wait in the outbox. */
  process(): Promise<void>;
  /** Replies produced but not yet delivered. */
  outbox(): readonly WorkerReply[];
  /** Delivers the reply at `index`, or every reply in order when omitted. */
  release(index?: number): void;
  /** Delivers an arbitrary message to the client. */
  deliver(data: unknown): void;
  /** Simulates the worker crashing. */
  crash(message: string): void;
}

export function createDeferredWorker(engine: SpellEngine): DeferredWorker {
  const handler = createWorkerHandler(engine);
  const queue: WorkerRequest[] = [];
  const pendingReplies: WorkerReply[] = [];
  const worker: DeferredWorker = {
    posted: [],
    terminated: false,
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(message) {
      worker.posted.push(message);
      queue.push(message);
    },
    terminate() {
      worker.terminated = true;
    },
    async process() {
      while (queue.length > 0) {
        const request = queue.shift();
        pendingReplies.push(await handler(request));
      }
    },
    outbox: () => pendingReplies,
    release(index) {
      if (index !== undefined) {
        const [reply] = pendingReplies.splice(index, 1);
        if (reply) worker.deliver(reply);
        return;
      }
      pendingReplies.splice(0).forEach((reply) => worker.deliver(reply));
    },
    deliver(data) {
      worker.onmessage?.({ data });
    },
    crash(message) {
      worker.onerror?.({ message });
    },
  };
  return worker;
}
