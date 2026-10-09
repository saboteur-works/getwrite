/** Exact-origin navigation guard and IPC sender check (FR-35, Task 28). */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { isLocalOriginUrl, isTrustedSender } from "../src/navigation-guard";

const main = fs.readFileSync(path.resolve(__dirname, "../src/main.ts"), "utf8");

describe.each(["http://localhost:3000", "http://localhost:4123"])(
  "with local origin %s",
  (local) => {
    const port = new URL(local).port;
    const allowed = [`${local}/`, `${local}/some/path?x=1#y`];
    const refused = [
      `http://localhost:${port}@evil.example/`,
      `${local}0/`,
      `${local}.evil.example/`,
      `https://localhost:${port}/`,
      `http://127.0.0.1:${port}/`,
      "http://evil.example/",
      "file:///etc/passwd",
      "about:blank",
      "javascript:alert(1)",
      "",
      "not a url",
    ];

    it.each(allowed)("isLocalOriginUrl allows %s", (url) => {
      expect(isLocalOriginUrl(url, local)).toBe(true);
    });
    it.each(refused)("isLocalOriginUrl refuses %j", (url) => {
      expect(isLocalOriginUrl(url, local)).toBe(false);
    });

    it("isTrustedSender trusts the local origin URL", () => {
      expect(isTrustedSender(`${local}/`, local)).toBe(true);
    });
    it.each([null, undefined, ...refused])(
      "isTrustedSender refuses %j",
      (url) => {
        expect(isTrustedSender(url, local)).toBe(false);
      },
    );
  },
);

describe("main.ts wiring", () => {
  it("will-navigate handler has no startsWith and uses isLocalOriginUrl", () => {
    const start = main.indexOf('"will-navigate"');
    expect(start).toBeGreaterThan(-1);
    const body = main.slice(start, main.indexOf("\n  });", start));
    expect(body).not.toContain("startsWith(");
    expect(body).toContain("isLocalOriginUrl(");
  });

  it.each([
    "getwrite:sharing-get-status",
    "getwrite:sharing-set-enabled",
    "getwrite:sharing-generate-code",
    "getwrite:sharing-get-code",
  ])("handler for %s calls assertTrustedSender", (channel) => {
    const start = main.indexOf(`"${channel}"`);
    expect(start).toBeGreaterThan(-1);
    const next = main.indexOf("ipcMain.handle(", start);
    const end = next === -1 ? main.indexOf("\n}\n", start) : next;
    expect(main.slice(start, end)).toContain("assertTrustedSender(");
  });
});
