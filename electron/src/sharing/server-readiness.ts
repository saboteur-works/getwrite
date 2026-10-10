/**
 * @module server-readiness
 *
 * The main process's own request to the local server: the readiness poll.
 * It uses Node's `http`, which is not known to pass through
 * `session.webRequest`, so it sets the window header itself.
 */
import { WINDOW_HEADER } from "./window-secret";

/** Handle returned by a sender so the poll can observe connection errors. */
interface ReadinessRequest {
  onError: (callback: () => void) => void;
}

/** One GET: sends `headers`, reports the status code to `onResponse`. */
export type ReadinessGet = (
  url: string,
  headers: Record<string, string>,
  onResponse: (statusCode: number | undefined) => void,
) => ReadinessRequest;

/** Options for {@link waitForServer}. */
export interface WaitForServerOptions {
  url: string;
  secret: string;
  get: ReadinessGet;
  timeoutMs?: number;
  retryMs?: number;
}

/**
 * Polls the local server until it answers with a non-5xx status, sending the
 * window header on every attempt.
 *
 * @param options - See {@link WaitForServerOptions}.
 * @returns Resolves when ready; rejects at the deadline.
 */
export function waitForServer(options: WaitForServerOptions): Promise<void> {
  const { url, secret, get, timeoutMs = 30_000, retryMs = 500 } = options;
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const retry = (): void => {
      if (Date.now() > deadline) {
        reject(new Error("Server did not start in time"));
        return;
      }
      setTimeout(check, retryMs);
    };
    const check = (): void => {
      get(url, { [WINDOW_HEADER]: secret }, (statusCode) => {
        if (statusCode && statusCode < 500) resolve();
        else retry();
      }).onError(retry);
    };
    check();
  });
}
