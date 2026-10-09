/**
 * Exact-origin checks for the desktop window (FR-35).
 *
 * A string-prefix test on the URL lets `http://localhost:3000@evil.example/`
 * and `http://localhost:30001/` through; comparing parsed origins does not.
 * Kept free of Electron imports so it can be tested in plain Node.
 */

function parsedOrigin(value: string): string | null {
  try {
    const { origin } = new URL(value);
    // Opaque origins (file:, about:, javascript:) serialize as "null".
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/** True only when `url` parses and its origin equals the local origin exactly. */
export function isLocalOriginUrl(
  url: string,
  localOriginValue: string,
): boolean {
  const local = parsedOrigin(localOriginValue);
  if (local === null) return false;
  return parsedOrigin(url) === local;
}

/** True only for a present, parseable sender URL on the local origin. */
export function isTrustedSender(
  senderUrl: string | null | undefined,
  localOriginValue: string,
): boolean {
  if (senderUrl === null || senderUrl === undefined || senderUrl === "") {
    return false;
  }
  return isLocalOriginUrl(senderUrl, localOriginValue);
}
