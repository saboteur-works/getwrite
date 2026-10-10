/**
 * No HTTP route may touch the paired-device store except pairing itself
 * (Feature 76, Task 6; FR-5 "no new route", FR-23).
 *
 * Found by reading every route.ts under app/api: the only one importing
 * lib/sharing/credential-store (or mentioning device-credentials) is
 * app/api/sharing/pair/route.ts. The gate and status logic live in
 * src/lib/sharing/, not in a route file.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const API_ROOT = path.resolve(__dirname, "../../app/api");
const ALLOWED = new Set(["sharing/pair/route.ts"]);

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

const rel = (file: string): string =>
  path.relative(API_ROOT, file).split(path.sep).join("/");

describe("no HTTP route touches the device store", () => {
  const files = routeFiles(API_ROOT);

  it("finds the route files (the walk is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.map(rel)).toContain("sharing/pair/route.ts");
  });

  it("only the pair route imports credential-store or names device-credentials", () => {
    const offenders = files
      .filter((file) => {
        const text = fs.readFileSync(file, "utf8");
        return /credential-store|device-credentials/.test(text);
      })
      .map(rel)
      .filter((name) => !ALLOWED.has(name));
    expect(offenders).toEqual([]);
  });

  it("no route path contains 'devices'", () => {
    expect(files.map(rel).filter((name) => /devices/.test(name))).toEqual([]);
  });
});
