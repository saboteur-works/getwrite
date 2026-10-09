import { describe, expect, it } from "vitest";

import { deriveDeviceName } from "../../src/lib/sharing/device-name";

const FALLBACK = "Unknown browser on unknown device";

describe("deriveDeviceName", () => {
  const cases: Array<[string, string, string]> = [
    [
      "Safari on iPad",
      "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      "Safari on iPad",
    ],
    [
      "Safari on iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      "Safari on iPhone",
    ],
    [
      "Chrome on Android",
      "Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
      "Chrome on Android",
    ],
    [
      "Chrome on Windows",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Chrome on Windows",
    ],
    [
      "Firefox on Linux",
      "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
      "Firefox on Linux",
    ],
    [
      "Safari on Mac",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      "Safari on Mac",
    ],
    [
      "Edge on Windows",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
      "Edge on Windows",
    ],
    [
      "Chrome on iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1",
      "Chrome on iPhone",
    ],
  ];

  it.each(cases)("%s", (_label, userAgent, expected) => {
    expect(deriveDeviceName(userAgent)).toBe(expected);
  });

  it("falls back for an empty user agent", () => {
    expect(deriveDeviceName("")).toBe(FALLBACK);
  });

  it("falls back for an unrecognised user agent", () => {
    expect(deriveDeviceName("curl/8.4.0")).toBe(FALLBACK);
  });

  it("names only the part it recognises when the other is unknown", () => {
    expect(deriveDeviceName("Mozilla/5.0 Firefox/125.0")).toBe(
      "Firefox on unknown device",
    );
    expect(deriveDeviceName("Mozilla/5.0 (Windows NT 10.0)")).toBe(
      "Unknown browser on Windows",
    );
  });

  it("bounds the length of the result", () => {
    expect(deriveDeviceName("x".repeat(10000)).length).toBeLessThan(80);
  });
});
