// Last Updated: 2026-10-20

/**
 * Feature 90, Task 29 (FR-27): no module reachable from
 * `src/lib/projectTypes.ts` may import the `server-only` package or
 * `lib/auth/auth-config` (which imports it). The CLI and the Electron import
 * workers load this library without a bundler alias, so a reachable
 * `server-only` import throws at load (Stage 6.5 finding F-1).
 *
 * Source-level walk of relative static and dynamic imports, re-exports and
 * `require` calls.
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ENTRY = path.resolve(__dirname, "../../src/lib/projectTypes.ts");

/**
 * Feature 91, Task 9: the font modules and the typography codecs are imported
 * by client components, so they get the same closure check. Every
 * `src/lib/fonts/*.ts` file is an entry (a new font module is covered
 * automatically), plus `src/lib/typography-values.ts`.
 */
const FONT_DIR = path.resolve(__dirname, "../../src/lib/fonts");
const FONT_ENTRIES: string[] = [
  ...readdirSync(FONT_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(FONT_DIR, f)),
  path.resolve(__dirname, "../../src/lib/typography-values.ts"),
];

const SPECIFIER_PATTERNS: RegExp[] = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
];

function specifiersOf(source: string): string[] {
  const found: string[] = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

/** Every offending import found in the closure, as "<file> imports <specifier>". */
function findOffenders(entry: string): {
  offenders: string[];
  visited: number;
} {
  const seen = new Set<string>();
  const offenders: string[] = [];
  const queue: string[] = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
      const rel = path.relative(path.dirname(entry), file);
      if (specifier === "server-only" || /auth\/auth-config$/.test(specifier)) {
        offenders.push(`${rel} imports ${specifier}`);
      }
      if (specifier.startsWith(".")) {
        const resolved = resolveRelative(file, specifier);
        if (resolved) queue.push(resolved);
      }
    }
  }
  return { offenders, visited: seen.size };
}

/** Every import specifier found in the relative-import closure of `entry`. */
function closureSpecifiers(entry: string): Set<string> {
  const seen = new Set<string>();
  const found = new Set<string>();
  const queue: string[] = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
      found.add(specifier);
      if (specifier.startsWith(".")) {
        const resolved = resolveRelative(file, specifier);
        if (resolved) queue.push(resolved);
      }
    }
  }
  return found;
}

describe("project-type library import closure (FR-27)", () => {
  it("reaches no server-only or auth-config import from projectTypes.ts", () => {
    const { offenders, visited } = findOffenders(ENTRY);
    expect(visited).toBeGreaterThan(1);
    expect(offenders).toEqual([]);
  });
});

describe("font and typography modules import closure (Feature 91, Task 9)", () => {
  it("has entries for the font modules and typography-values", () => {
    expect(FONT_ENTRIES.length).toBeGreaterThanOrEqual(2);
    for (const entry of FONT_ENTRIES)
      expect(existsSync(entry), entry).toBe(true);
  });

  it("reaches no server-only, auth-config or Node-only import", () => {
    for (const entry of FONT_ENTRIES) {
      const { offenders } = findOffenders(entry);
      expect(offenders, entry).toEqual([]);
      const nodeOnly = [...closureSpecifiers(entry)].filter(
        (s) => /^node:/.test(s) || s === "fs" || s === "path",
      );
      expect(nodeOnly, entry).toEqual([]);
    }
  });
});
