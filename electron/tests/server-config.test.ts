/**
 * The server port has one source (FR-25). These tests depend on the port's
 * structure, never its value.
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

  it("imports from ./server-config", () => {
    expect(source).toMatch(/from "\.\/server-config"/);
  });
});
