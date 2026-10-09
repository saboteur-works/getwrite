/**
 * Automatic device naming for paired devices (Feature 75, FR-18).
 *
 * The name comes only from the `User-Agent` header, never from request body
 * content. No dependency: an ordered list of substring checks, most specific
 * first (Edge, Opera and Chrome-on-iOS UAs also contain "Chrome" or "Safari").
 */

const UNKNOWN_BROWSER = "Unknown browser";
const UNKNOWN_DEVICE = "unknown device";

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:Edg|EdgA|EdgiOS|Edge)\//, "Edge"],
  [/\bOPR\//, "Opera"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\b(?:Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

const DEVICES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\biPad\b/, "iPad"],
  [/\biPhone\b/, "iPhone"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMacintosh\b|\bMac OS X\b/, "Mac"],
  [/\bLinux\b|\bX11\b/, "Linux"],
];

function firstMatch(
  table: ReadonlyArray<readonly [RegExp, string]>,
  userAgent: string,
): string | undefined {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1];
}

export function deriveDeviceName(userAgent: string): string {
  // Bound the input so a hostile header cannot make matching expensive.
  const ua = userAgent.slice(0, 512);
  const browser = firstMatch(BROWSERS, ua) ?? UNKNOWN_BROWSER;
  const device = firstMatch(DEVICES, ua) ?? UNKNOWN_DEVICE;
  return `${browser} on ${device}`;
}
