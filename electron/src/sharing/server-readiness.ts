/**
 * @module server-readiness
 *
 * The main process's own check that the server on the port is the one it
 * forked (Feature 80, FR-10, FR-11). It polls a challenge route and accepts
 * only a reply that proves knowledge of the per-launch key
 * (`readiness-identity.ts`). No header of any kind is sent: the sender takes a
 * URL and an abort signal, so the window secret cannot reach a foreign
 * listener through this path. Polling stops when the forked server exits, and
 * every poll has its own timeout.
 */
import {
  READINESS_PATH,
  createChallenge,
  verifyReadinessProof,
  type RandomBytes,
} from "./readiness-identity";

/** What one poll got back; the body is already size-capped by the sender. */
export interface ReadinessReply {
  statusCode: number | undefined;
  body: string;
}

/** One GET. Rejects on a connection error or when `signal` aborts. */
export type ReadinessGet = (
  url: string,
  signal: AbortSignal,
) => Promise<ReadinessReply>;

/** Registers a listener for the forked server's exit (code may be null). */
type WatchExit = (listener: (code: number | null) => void) => void;

/** The deadline passed without the forked server proving itself. */
export class ServerNotReadyError extends Error {
  constructor() {
    super("Server did not start in time");
  }
}

/** The forked server exited before it proved itself. */
export class ServerExitedError extends Error {
  readonly code: number | null;
  constructor(code: number | null) {
    super("Server exited before it was ready");
    this.name = "ServerExitedError";
    this.code = code;
  }
}

/** Options for {@link waitForServer}. */
export interface WaitForServerOptions {
  /** The local origin, e.g. `localOrigin(PORT)`. */
  origin: string;
  /** The per-launch readiness key; never sent. */
  key: string;
  get: ReadinessGet;
  randomBytes: RandomBytes;
  watchExit: WatchExit;
  timeoutMs?: number;
  retryMs?: number;
  pollTimeoutMs?: number;
}

/** True when the reply is a 200 whose body proves knowledge of the key. */
function proves(
  reply: ReadinessReply,
  key: string,
  challenge: string,
): boolean {
  if (reply.statusCode !== 200) return false;
  try {
    const parsed: unknown = JSON.parse(reply.body);
    if (typeof parsed !== "object" || parsed === null) return false;
    const proof = (parsed as { proof?: unknown }).proof;
    return (
      typeof proof === "string" && verifyReadinessProof(key, challenge, proof)
    );
  } catch {
    return false;
  }
}

/**
 * Polls until the forked server proves its identity.
 *
 * @param options - See {@link WaitForServerOptions}.
 * @returns Resolves on proof; rejects with {@link ServerNotReadyError} at the
 *   deadline or {@link ServerExitedError} if the forked server exits first.
 */
export function waitForServer(options: WaitForServerOptions): Promise<void> {
  const {
    origin,
    key,
    get,
    randomBytes,
    watchExit,
    timeoutMs = 30_000,
    retryMs = 500,
    pollTimeoutMs = 2_000,
  } = options;
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let settled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let abortPoll: (() => void) | undefined;

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      abortPoll?.();
      if (error) reject(error);
      else resolve();
    };
    const retry = (): void => {
      if (settled) return;
      if (Date.now() > deadline) finish(new ServerNotReadyError());
      else retryTimer = setTimeout(poll, retryMs);
    };
    const poll = (): void => {
      if (settled) return;
      const challenge = createChallenge(randomBytes);
      const controller = new AbortController();
      let pollDone = false;
      const endPoll = (next: () => void): void => {
        if (pollDone) return;
        pollDone = true;
        clearTimeout(timer);
        next();
      };
      const timer = setTimeout(() => {
        controller.abort();
        endPoll(retry);
      }, pollTimeoutMs);
      abortPoll = () => controller.abort();
      const url = `${origin}${READINESS_PATH}?challenge=${challenge}`;
      let request: Promise<ReadinessReply>;
      try {
        request = get(url, controller.signal);
      } catch {
        endPoll(retry);
        return;
      }
      request.then(
        (reply) =>
          endPoll(() => (proves(reply, key, challenge) ? finish() : retry())),
        () => endPoll(retry),
      );
    };

    watchExit((code) => finish(new ServerExitedError(code)));
    poll();
  });
}
