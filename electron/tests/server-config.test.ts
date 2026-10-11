/**
 * The server port has one source (FR-25). These tests depend on the port's
 * structure, never its value, except the one pinning test below (Feature 80
 * FR-2), which is the only test anywhere that names the value.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import * as serverConfig from "../src/server-config";

describe("server-config", () => {
  it.each([1, 80, 3000, 8765, 65535])(
    "localOrigin(%i) returns http://localhost:<port>",
    (port) => {
      expect(serverConfig.localOrigin(port)).toBe(`http://localhost:${port}`);
    },
  );

  it("exports exactly one port constant", () => {
    const numericExports = Object.entries(serverConfig).filter(
      ([, value]) => typeof value === "number",
    );
    expect(numericExports).toHaveLength(1);
    expect(numericExports[0][0]).toBe("PORT");
  });

  it("pins the desktop server port at 7340 (Feature 80 FR-1)", () => {
    expect(serverConfig.PORT).toBe(7340);
  });

  it.each([1, 41234, 65535])(
    "serverPortEnv(%i) is the decimal string the forked server reads as PORT",
    (port) => {
      expect(serverConfig.serverPortEnv(port)).toBe(String(port));
    },
  );

  it("keeps the loopback hostname constant", () => {
    expect(serverConfig.HOSTNAME).toBe("127.0.0.1");
  });
});

describe("main.ts reads the port from server-config only", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "main.ts"),
    "utf8",
  );
  const lines = source.split("\n");

  it("assigns no numeric literal to a port", () => {
    const offenders = lines.filter((line) =>
      /\bport\b\s*[:=]\s*\d/i.test(line),
    );
    expect(offenders).toEqual([]);
  });

  it("has no localhost: string literal outside the import", () => {
    const offenders = lines.filter(
      (line) => line.includes("localhost:") && !/^\s*(\/\/|\*)/.test(line),
    );
    expect(offenders).toEqual([]);
  });

  it("passes the server PORT env through serverPortEnv, not String(PORT)", () => {
    expect(source).toContain("PORT: serverPortEnv(PORT)");
    expect(source).not.toContain("String(PORT)");
  });

  it("uses PORT only as an argument to a function or as the status port", () => {
    const uses = lines
      .filter((line) => /\bPORT\b/.test(line))
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .filter((line) => !line.includes('from "./server-config"'));
    for (const line of uses) {
      expect(line).toMatch(
        /localOrigin\(PORT\)|serverPortEnv\(PORT\)|port: PORT,/,
      );
    }
    expect(uses.length).toBeGreaterThan(0);
  });

  it("contains no 3000 or 7340 literal", () => {
    expect(source).not.toMatch(/\b(3000|7340)\b/);
  });

  it("imports from ./server-config", () => {
    expect(source).toMatch(/from "\.\/server-config"/);
  });
});
