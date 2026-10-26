/**
 * @module spell-client
 *
 * Main-thread client of the spell-check worker (FR-21, FR-23). It posts
 * requests and applies replies; it never touches an engine. Each check
 * carries a document version, and a result for a version older than the
 * newest one requested is discarded. A failure to create or load the worker,
 * a crash, a malformed reply or an engine error during a check becomes one
 * `unavailable` event with a reason; it is never delivered as an empty result.
 * A failed suggest resolves as `unavailable`, which differs from an empty list.
 */
import {
  validateWorkerReply,
  type BlockResult,
  type CheckBlock,
  type WorkerReply,
  type WorkerRequest,
} from "./worker-protocol";

/** The part of `Worker` the client uses; a test double implements it. */
export interface SpellWorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
}

export type SpellClientEvent =
  | { type: "ready" }
  | { type: "result"; version: number; blocks: BlockResult[] }
  | { type: "unavailable"; reason: string };

export type SuggestResult =
  | { status: "ok"; suggestions: string[] }
  | { status: "unavailable"; reason: string };

export interface SpellClient {
  /** Requests a check of `blocks` for document `version`. No-op once unavailable. */
  check(version: number, blocks: CheckBlock[]): void;
  /** Requests suggestions for one word. Never rejects. */
  suggest(word: string): Promise<SuggestResult>;
  /** Subscribes to events; returns an unsubscribe function. */
  subscribe(listener: (event: SpellClientEvent) => void): () => void;
  /** Terminates the worker; later replies are ignored. */
  dispose(): void;
}

export interface SpellClientOptions {
  createWorker: () => SpellWorkerLike;
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Creates a client. The worker is created on first use, not here. */
export function createSpellClient(options: SpellClientOptions): SpellClient {
  const listeners = new Set<(event: SpellClientEvent) => void>();
  const pendingSuggests = new Map<number, (result: SuggestResult) => void>();
  let worker: SpellWorkerLike | null = null;
  let unavailableReason: string | null = null;
  let isDisposed = false;
  let currentVersion = Number.NEGATIVE_INFINITY;
  let nextRequestId = 1;

  const emit = (event: SpellClientEvent): void => {
    if (isDisposed) return;
    listeners.forEach((listener) => listener(event));
  };

  const becomeUnavailable = (reason: string): void => {
    if (unavailableReason !== null || isDisposed) return;
    unavailableReason = reason;
    pendingSuggests.forEach((resolve) =>
      resolve({ status: "unavailable", reason }),
    );
    pendingSuggests.clear();
    worker?.terminate();
    emit({ type: "unavailable", reason });
  };

  const onReply = (data: unknown): void => {
    if (isDisposed || unavailableReason !== null) return;
    const invalid = validateWorkerReply(data);
    if (invalid !== null) return becomeUnavailable(invalid);
    const reply = data as WorkerReply;
    switch (reply.type) {
      case "ready":
        return emit({ type: "ready" });
      case "checked":
        if (reply.version < currentVersion) return;
        return emit({
          type: "result",
          version: reply.version,
          blocks: reply.blocks,
        });
      case "suggested":
        pendingSuggests.get(reply.requestId)?.({
          status: "ok",
          suggestions: reply.suggestions,
        });
        pendingSuggests.delete(reply.requestId);
        return;
      case "error": {
        const resolve =
          reply.requestId === undefined
            ? undefined
            : pendingSuggests.get(reply.requestId);
        if (reply.requestId !== undefined && resolve) {
          pendingSuggests.delete(reply.requestId);
          return resolve({ status: "unavailable", reason: reply.message });
        }
        if (reply.version !== undefined && reply.version < currentVersion)
          return;
        return becomeUnavailable(reply.message);
      }
    }
  };

  const ensureWorker = (): SpellWorkerLike | null => {
    if (worker || unavailableReason !== null || isDisposed) return worker;
    try {
      const created = options.createWorker();
      created.onmessage = (event) => onReply(event.data);
      created.onerror = (event) =>
        becomeUnavailable(event.message ?? "the spell-check worker failed");
      created.onmessageerror = () =>
        becomeUnavailable("the spell-check worker sent an unreadable message");
      worker = created;
      created.postMessage({ type: "init" });
    } catch (err) {
      becomeUnavailable(reasonOf(err));
    }
    return worker;
  };

  return {
    check(version, blocks) {
      const target = ensureWorker();
      if (!target || unavailableReason !== null) return;
      currentVersion = Math.max(currentVersion, version);
      target.postMessage({ type: "check", version, blocks });
    },
    suggest(word) {
      const target = ensureWorker();
      if (!target || unavailableReason !== null) {
        return Promise.resolve({
          status: "unavailable",
          reason: unavailableReason ?? "the spell checker is not running",
        });
      }
      return new Promise<SuggestResult>((resolve) => {
        const requestId = nextRequestId++;
        pendingSuggests.set(requestId, resolve);
        target.postMessage({ type: "suggest", requestId, word });
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (isDisposed) return;
      isDisposed = true;
      pendingSuggests.forEach((resolve) =>
        resolve({
          status: "unavailable",
          reason: "the spell checker was shut down",
        }),
      );
      pendingSuggests.clear();
      worker?.terminate();
      listeners.clear();
    },
  };
}
