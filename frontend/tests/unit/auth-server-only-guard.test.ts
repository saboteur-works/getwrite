/**
 * Confirms the FR5 server-only guard: `auth-config.ts` and `auth-server.ts`
 * both import `server-only` as their first import statement, so either
 * module throws at build time if ever pulled into a client bundle.
 *
 * This is a source-text assertion rather than a runtime import assertion:
 * Vitest runs outside Next.js's bundler "react-server" condition that
 * normally makes the real `server-only` package inert on the server, so a
 * real (unmocked) import of either module would throw in this test
 * environment regardless of correctness — the source-text check is the
 * reliable way to assert the guard is present and first.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect } from "vitest";

const AUTH_DIR = path.resolve(__dirname, "../../src/lib/auth");

async function firstImportStatement(fileName: string): Promise<string> {
  const contents = await fs.readFile(path.join(AUTH_DIR, fileName), "utf8");
  const match = contents.match(/^\s*import\s.+;/m);
  if (!match) throw new Error(`No import statement found in ${fileName}`);
  return match[0].trim();
}

describe("auth module server-only guard (FR5)", () => {
  it("auth-config.ts imports server-only as its first import", async () => {
    expect(await firstImportStatement("auth-config.ts")).toBe(
      'import "server-only";',
    );
  });

  it("auth-server.ts imports server-only as its first import", async () => {
    expect(await firstImportStatement("auth-server.ts")).toBe(
      'import "server-only";',
    );
  });
});
