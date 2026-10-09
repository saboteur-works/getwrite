/**
 * Same-origin check for state-changing requests (Feature 75, FR-29).
 *
 * Compares `Origin`, falling back to `Referer`, against the request's own
 * `Host` header. `X-Forwarded-Host` is never read: it was measured
 * client-forgeable. When the request cannot be shown to be same-origin
 * (both `Origin` and `Referer` absent, either unparseable, `Host` absent)
 * the check fails.
 */

export interface HeaderReader {
  get(name: string): string | null;
}

const SAFE_METHODS = new Set(["GET", "HEAD"]);

function hostOf(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.host.toLowerCase();
  } catch {
    return undefined;
  }
}

export function isSameOrigin(input: {
  method: string;
  headers: HeaderReader;
}): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;

  const host = input.headers.get("host")?.trim().toLowerCase();
  if (!host) return false;

  const origin = input.headers.get("origin");
  const source = origin !== null ? origin : input.headers.get("referer");
  if (source === null) return false;

  return hostOf(source) === host;
}
