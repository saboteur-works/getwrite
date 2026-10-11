/**
 * Per-launch window secret: generation and header attach. The readiness check
 * moved to server-readiness.test.ts (Feature 80, Task 9).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createWindowSecret,
  installWindowSecret,
  WINDOW_HEADER,
  type BeforeSendHeadersDetails,
  type BeforeSendHeadersResponse,
  type WindowSecretSession,
} from "../src/sharing/window-secret";

const ORIGIN = "http://localhost:3000";
const SECRET = "s".repeat(64);

function fakeSession(): {
  session: WindowSecretSession;
  fire: (
    url: string,
    headers: Record<string, string>,
  ) => { calls: number; response: BeforeSendHeadersResponse | undefined };
} {
  let handler:
    | ((
        d: BeforeSendHeadersDetails,
        cb: (r: BeforeSendHeadersResponse) => void,
      ) => void)
    | undefined;
  return {
    session: {
      webRequest: {
        onBeforeSendHeaders: (h) => {
          handler = h;
        },
      },
    },
    fire: (url, headers) => {
      let calls = 0;
      let response: BeforeSendHeadersResponse | undefined;
      handler?.({ url, requestHeaders: headers }, (r) => {
        calls += 1;
        response = r;
      });
      return { calls, response };
    },
  };
}

describe("createWindowSecret", () => {
  it("is 32 random bytes as hex, from the injected source", () => {
    const secret = createWindowSecret((n) => Buffer.alloc(n, 0xab));
    expect(secret).toBe("ab".repeat(32));
  });

  it("differs between calls with the real source", () => {
    const real = createWindowSecret;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomBytes } =
      require("node:crypto") as typeof import("node:crypto");
    expect(real(randomBytes)).not.toBe(real(randomBytes));
  });

  it("uses crypto.randomBytes and never Math.random (source text)", () => {
    const src = readFileSync(
      path.join(__dirname, "../src/sharing/window-secret.ts"),
      "utf8",
    );
    expect(src).not.toContain("Math.random");
    const main = readFileSync(path.join(__dirname, "../src/main.ts"), "utf8");
    expect(main).toMatch(/createWindowSecret\(\s*randomBytes\s*\)/);
    expect(main).toMatch(/randomBytes[^;]*from "crypto"|from "node:crypto"/);
  });
});

describe("installWindowSecret", () => {
  it.each([
    ["a document URL", `${ORIGIN}/`],
    ["an api URL", `${ORIGIN}/api/projects`],
    ["a static asset URL", `${ORIGIN}/_next/static/chunks/a.js`],
  ])("adds the header for %s", (_n, url) => {
    const { session, fire } = fakeSession();
    installWindowSecret(session, ORIGIN, SECRET);
    const out = fire(url, { Accept: "x" });
    expect(out.calls).toBe(1);
    expect(out.response?.requestHeaders?.[WINDOW_HEADER]).toBe(SECRET);
  });

  it("follows the origin passed in: header on 41234, none on 3000 or 7340", () => {
    const origin = "http://localhost:41234";
    const { session, fire } = fakeSession();
    installWindowSecret(session, origin, SECRET);
    expect(
      fire(`${origin}/api/x`, {}).response?.requestHeaders?.[WINDOW_HEADER],
    ).toBe(SECRET);
    for (const other of ["http://localhost:3000", "http://localhost:7340"]) {
      expect(
        fire(`${other}/api/x`, {}).response?.requestHeaders?.[WINDOW_HEADER],
      ).toBeUndefined();
    }
  });

  it("preserves existing headers", () => {
    const { session, fire } = fakeSession();
    installWindowSecret(session, ORIGIN, SECRET);
    const out = fire(`${ORIGIN}/api/x`, { Accept: "x", "X-A": "b" });
    expect(out.response?.requestHeaders).toMatchObject({
      Accept: "x",
      "X-A": "b",
    });
  });

  it.each([
    ["another host", "http://example.com:3000/"],
    ["another port", "http://localhost:3001/"],
    ["a longer port sharing the prefix", "http://localhost:30001/"],
    [
      "a host that merely begins with the origin",
      "http://localhost:3000.evil.test/",
    ],
  ])("does not add the header for %s but still calls back once", (_n, url) => {
    const { session, fire } = fakeSession();
    installWindowSecret(session, ORIGIN, SECRET);
    const out = fire(url, { Accept: "x" });
    expect(out.calls).toBe(1);
    expect(out.response?.requestHeaders?.[WINDOW_HEADER]).toBeUndefined();
    expect(out.response?.requestHeaders?.Accept).toBe("x");
  });

  it("does not add the header for an unparseable URL", () => {
    const { session, fire } = fakeSession();
    installWindowSecret(session, ORIGIN, SECRET);
    const out = fire("not a url", {});
    expect(out.calls).toBe(1);
    expect(out.response?.requestHeaders?.[WINDOW_HEADER]).toBeUndefined();
  });

  it("takes no logger and the module never logs", () => {
    const src = readFileSync(
      path.join(__dirname, "../src/sharing/window-secret.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/\blog\(/);
  });
});
