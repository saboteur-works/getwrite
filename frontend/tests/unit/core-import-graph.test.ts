// Last Updated: 2026-11-07

/**
 * Feature 103, Task 4 (FR-4): the Electron import workers and the CLI load
 * `src/lib/core.ts` (and everything it reaches) with `electron/tsconfig.worker.json`
 * and the CLI's tsconfig, neither of which has `resolveJsonModule` or `jsx`.
 * A reachable `react` import, `.tsx`/`.jsx` file, `.json` file or UI-registry
 * file breaks those builds (Run B, commit 5894375f).
 *
 * Source-level walk of static imports, `export ... from`, side-effect imports,
 * dynamic `import("...")` and `require("...")` specifier strings, resolving
 * relative paths and the `@gw/core` alias (-> core.ts). Entries: `core.ts`, and
 * the model-side registry, manifest and shared rebuild list when present.
 *
 * Type-only imports (`import type ...`, `export type ... from`) are erased by
 * the compiler and emit no runtime import, so they are not followed or
 * flagged by the walker. This is decided for an erased import only; a
 * file that is type-checked by the worker tsc pass still needs to resolve, but
 * the failing cases here (jsx, json) need a value import to reach them in
 * practice. The walker is exercised on synthetic sources below.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = path.resolve(__dirname, "../..");
const LIB_DIR = path.join(FRONTEND_ROOT, "src/lib");
const CORE_ENTRY = path.join(LIB_DIR, "core.ts");

/** Entries named in addition to core.ts; absent ones are skipped. */
const NAMED_ENTRIES: string[] = [
  "models/modules/registry.ts",
  "models/modules/manifest.ts",
  "models/derived-index-rebuild.ts",
].map((p) => path.join(LIB_DIR, p));

const UI_REGISTRY_SEGMENT = "components/Modules/";

const SPECIFIER_PATTERNS: RegExp[] = [
  /\b(?:import|export)\s+(?!type\b)(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
];

/** Runtime import specifiers of a source text (type-only forms excluded). */
export function runtimeSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** Why a specifier is forbidden in the worker graph, or null if it is fine. */
export function forbiddenReason(specifier: string): string | null {
  if (specifier === "react" || specifier.startsWith("react/"))
    return "imports react";
  if (specifier === "react-dom" || specifier.startsWith("react-dom/"))
    return "imports react-dom";
  if (/\.(tsx|jsx)$/.test(specifier)) return "imports a JSX file";
  if (/\.json$/.test(specifier)) return "imports a JSON file";
  if (specifier.includes(UI_REGISTRY_SEGMENT)) return "imports the UI registry";
  if (/(^|\/)Modules\/uiRegistry$/.test(specifier))
    return "imports the UI registry";
  return null;
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier === "@gw/core") return CORE_ENTRY;
  if (specifier.startsWith("@/"))
    base = path.join(FRONTEND_ROOT, specifier.slice(2));
  else if (specifier.startsWith("."))
    base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

interface WalkResult {
  offenders: string[];
  visited: string[];
}

/** Walks from `entry`; reports "<file> <reason>: <specifier>" per offence. */
function walk(entry: string): WalkResult {
  const seen = new Set<string>();
  const offenders: string[] = [];
  const queue: string[] = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const rel = path.relative(FRONTEND_ROOT, file);
    if (/\.(tsx|jsx|json)$/.test(file)) {
      offenders.push(`${rel} is a ${path.extname(file)} file`);
      continue;
    }
    for (const specifier of runtimeSpecifiers(readFileSync(file, "utf8"))) {
      const reason = forbiddenReason(specifier);
      if (reason) offenders.push(`${rel} ${reason}: ${specifier}`);
      const resolved = resolveSpecifier(file, specifier);
      if (resolved) queue.push(resolved);
    }
  }
  return { offenders, visited: [...seen] };
}

describe("walker and predicate (can fail)", () => {
  const flagged = (source: string): string[] =>
    runtimeSpecifiers(source)
      .map(forbiddenReason)
      .filter((r): r is string => r !== null);

  it("flags a react import", () => {
    expect(flagged(`import { useState } from "react";`)).toEqual([
      "imports react",
    ]);
    expect(flagged(`import("react-dom/client")`)).toEqual([
      "imports react-dom",
    ]);
  });

  it("flags a .json import", () => {
    expect(flagged(`import t from "./novel.json";`)).toEqual([
      "imports a JSON file",
    ]);
    expect(flagged(`const t = require("../x/y.json");`)).toEqual([
      "imports a JSON file",
    ]);
  });

  it("flags a .tsx import", () => {
    expect(flagged(`export { A } from "./A.tsx";`)).toEqual([
      "imports a JSX file",
    ]);
  });

  it("flags a UI-registry import", () => {
    expect(
      flagged(`import { r } from "../../components/Modules/uiRegistry";`),
    ).toEqual(["imports the UI registry"]);
  });

  it("finds specifiers in side-effect, re-export and dynamic forms", () => {
    expect(
      runtimeSpecifiers(
        `import "a";\nexport * from "b";\nexport { x } from "c";\nconst m = await import("d");`,
      ),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("does not flag type-only imports (erased at compile time)", () => {
    expect(
      flagged(
        `import type { P } from "react";\nexport type { Q } from "./Q.tsx";`,
      ),
    ).toEqual([]);
  });

  it("flags nothing in an ordinary relative import", () => {
    expect(flagged(`import { a } from "./a";`)).toEqual([]);
  });
});

describe("worker import graph (FR-4)", () => {
  it("core.ts reaches no react, JSX, JSON or UI-registry file", () => {
    const { offenders, visited } = walk(CORE_ENTRY);
    expect(visited.length).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });

  it.each(NAMED_ENTRIES.filter((e) => existsSync(e)))(
    "%s reaches no react, JSX, JSON or UI-registry file",
    (entry) => {
      const { offenders, visited } = walk(entry);
      expect(visited.length).toBeGreaterThanOrEqual(1);
      expect(offenders).toEqual([]);
    },
  );

  it("registry.ts value-imports manifest.ts and manifest.ts does not value-import registry.ts (no runtime cycle, Feature 108 FR-2)", () => {
    const registry = path.join(LIB_DIR, "models/modules/registry.ts");
    const manifest = path.join(LIB_DIR, "models/modules/manifest.ts");
    expect(walk(registry).visited).toContain(manifest);
    expect(walk(manifest).visited).not.toContain(registry);
  });
});
