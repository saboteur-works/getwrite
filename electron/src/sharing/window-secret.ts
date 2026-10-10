/**
 * @module window-secret
 *
 * The per-launch window secret (FR-12). Generated in the main process, held
 * only there and in the server's environment, and attached to every request
 * the desktop window makes to the local server. This module takes no logger
 * and never writes the secret anywhere.
 */

/** Header the window's requests carry; the server compares it to its env. */
export const WINDOW_HEADER = "x-getwrite-window";

/** Source of random bytes; `crypto.randomBytes` in production. */
export type RandomBytes = (size: number) => Buffer;

/** The part of Electron's `webRequest.onBeforeSendHeaders` details used here. */
export interface BeforeSendHeadersDetails {
  url: string;
  requestHeaders: Record<string, string>;
}

/** The callback argument Electron expects. */
export interface BeforeSendHeadersResponse {
  requestHeaders?: Record<string, string>;
}

/** Minimal structural view of an Electron `Session`. */
export interface WindowSecretSession {
  webRequest: {
    onBeforeSendHeaders: (
      listener: (
        details: BeforeSendHeadersDetails,
        callback: (response: BeforeSendHeadersResponse) => void,
      ) => void,
    ) => void;
  };
}

/**
 * Creates a new window secret.
 *
 * @param randomBytes - Cryptographic random source (`crypto.randomBytes`).
 * @returns 32 random bytes as 64 hex characters.
 */
export function createWindowSecret(randomBytes: RandomBytes): string {
  return randomBytes(32).toString("hex");
}

/** True when `url` parses and has exactly the local origin. */
function isLocalOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/**
 * Registers a handler adding the window header to requests to the local
 * origin only. Other requests pass through unchanged; the callback is called
 * exactly once either way.
 *
 * @param session - The session whose requests are tagged.
 * @param origin - The local server origin (from `server-config.ts`).
 * @param secret - The per-launch window secret.
 */
export function installWindowSecret(
  session: WindowSecretSession,
  origin: string,
  secret: string,
): void {
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!isLocalOrigin(details.url, origin)) {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }
    callback({
      requestHeaders: { ...details.requestHeaders, [WINDOW_HEADER]: secret },
    });
  });
}
