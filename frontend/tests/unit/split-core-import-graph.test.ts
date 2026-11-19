/**
 * Feature 120, Task 9: every `frontend/src/lib/models/split-*.ts` file is model
 * code reachable from the CLI and the Electron workers, whose tsconfigs have no
 * `jsx` and no `resolveJsonModule`. Same source-level walk as
 * `claims-core-import-graph.test.ts`, applied to whatever split files exist
 * (so later files are covered as they appear):
 *
 * - no React, JSX, JSON or UI-registry file is reachable from any of them;
 * - none imports a `node:*` module itself, nor `fs` directly.
 *
 * Type-only imports are erased and not followed. The walker is exercised on
 * synthetic sources so it can fail.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = path.resolve(__dirname, "../..");
const MODELS_DIR = path.join(FRONTEND_ROOT, "src/lib/models");

/** Absolute paths of the split model files present now. */
function splitFiles(): string[] {
  return readdirSync(MODELS_DIR)
    .filter((name) => /^split-.*\.ts$/.test(name))
    .sort()
    .map((name) => path.join(MODELS_DIR, name));
}

const SPECIFIER_PATTERNS: RegExp[] = [
  /\b(?:import|export)\s+(?!type\b)(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
];

/** Runtime import specifiers of a source text (type-only forms excluded). */
function runtimeSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** Why a specifier may not be reachable from a split file, or null if it may. */
function forbiddenReason(specifier: string): string | null {
  if (specifier === "react" || specifier.startsWith("react/"))
    return "imports react";
  if (specifier === "react-dom" || specifier.startsWith("react-dom/"))
    return "imports react-dom";
  if (/\.(tsx|jsx)$/.test(specifier)) return "imports a JSX file";
  if (/\.json$/.test(specifier)) return "imports a JSON file";
  if (specifier.includes("components/Modules/"))
    return "imports the UI registry";
  return null;
}

function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith("node:");
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier === "@gw/core")
    base = path.join(FRONTEND_ROOT, "src/lib/core.ts");
  else if (specifier.startsWith("@/"))
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

interface Walk {
  visited: string[];
  offenders: string[];
}

function walk(entry: string): Walk {
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
  return { visited: [...seen], offenders };
}

describe("walker (can fail)", () => {
  it("finds runtime specifiers and skips type-only imports", () => {
    expect(
      runtimeSpecifiers(
        `import a from "./a";\nimport type { T } from "react";\nexport { b } from "./b";\nconst c = await import("node:fs");`,
      ),
    ).toEqual(["./a", "./b", "node:fs"]);
  });

  it("flags react, JSX, JSON and the UI registry, and recognises node:*", () => {
    expect(forbiddenReason("react")).toBe("imports react");
    expect(forbiddenReason("./A.tsx")).toBe("imports a JSX file");
    expect(forbiddenReason("./x.json")).toBe("imports a JSON file");
    expect(forbiddenReason("../../components/Modules/uiRegistry")).toBe(
      "imports the UI registry",
    );
    expect(forbiddenReason("./ordinary")).toBeNull();
    expect(isNodeBuiltin("node:path")).toBe(true);
    expect(isNodeBuiltin("./node-thing")).toBe(false);
  });
});

describe("split model files import graph (Feature 120)", () => {
  it("finds at least split-types.ts", () => {
    const names = splitFiles().map((f) => path.basename(f));
    expect(names).toContain("split-types.ts");
  });

  it("every split file reaches no react, JSX, JSON or UI-registry file", () => {
    for (const file of splitFiles()) {
      expect(walk(file).offenders, path.basename(file)).toEqual([]);
    }
  });

  it("no split file imports a node:* module or fs itself", () => {
    for (const file of splitFiles()) {
      const own = runtimeSpecifiers(readFileSync(file, "utf8")).filter(
        (s) => isNodeBuiltin(s) || /^fs(\/promises)?$/.test(s),
      );
      expect(own, path.basename(file)).toEqual([]);
    }
  });
});

/** Absolute paths of the merge model files present now (Feature 121). */
function mergeFiles(): string[] {
  return readdirSync(MODELS_DIR)
    .filter((name) => /^merge-.*\.ts$/.test(name))
    .sort()
    .map((name) => path.join(MODELS_DIR, name));
}

describe("merge model files import graph (Feature 121)", () => {
  it("finds at least merge-types.ts", () => {
    const names = mergeFiles().map((f) => path.basename(f));
    expect(names).toContain("merge-types.ts");
  });

  it("every merge file reaches no react, JSX, JSON or UI-registry file", () => {
    for (const file of mergeFiles()) {
      expect(walk(file).offenders, path.basename(file)).toEqual([]);
    }
  });

  it("no merge file imports a node:* module or fs itself", () => {
    for (const file of mergeFiles()) {
      const own = runtimeSpecifiers(readFileSync(file, "utf8")).filter(
        (s) => isNodeBuiltin(s) || /^fs(\/promises)?$/.test(s),
      );
      expect(own, path.basename(file)).toEqual([]);
    }
  });
});
