/**
 * Feature 108, Task 27 (FR-23): the claim cores are model code reachable from
 * the CLI and the Electron workers, whose tsconfigs have no `jsx` and no
 * `resolveJsonModule`. Extends the `core-import-graph.test.ts` approach (a
 * source-level walk of runtime import specifiers) to the three claim cores:
 *
 * - no React, JSX, JSON or UI-registry file is reachable from any of them;
 * - none of the three files imports a `node:*` module itself, and none
 *   imports `fs` directly (storage goes through the adapter).
 *
 * Type-only imports are erased and not followed, as in `core-import-graph`.
 * The walker is exercised on synthetic sources so it can fail.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = path.resolve(__dirname, "../..");
const MODELS_DIR = path.join(FRONTEND_ROOT, "src/lib/models");

const CLAIM_CORES: string[] = [
  "claims-add-core.ts",
  "claims-update-core.ts",
  "claims-list-core.ts",
].map((name) => path.join(MODELS_DIR, name));

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

/** Why a specifier may not be reachable from a core, or null if it may. */
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
  /** Relative file -> its `node:*` specifiers. */
  nodeImports: Map<string, string[]>;
}

function walk(entry: string): Walk {
  const seen = new Set<string>();
  const offenders: string[] = [];
  const nodeImports = new Map<string, string[]>();
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
      if (isNodeBuiltin(specifier)) {
        nodeImports.set(rel, [...(nodeImports.get(rel) ?? []), specifier]);
      }
      const resolved = resolveSpecifier(file, specifier);
      if (resolved) queue.push(resolved);
    }
  }
  return { visited: [...seen], offenders, nodeImports };
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

describe("claim cores import graph (FR-23)", () => {
  it.each(CLAIM_CORES)("%s exists and is walked", (core) => {
    expect(existsSync(core)).toBe(true);
    expect(walk(core).visited.length).toBeGreaterThan(5);
  });

  it.each(CLAIM_CORES)(
    "%s reaches no react, JSX, JSON or UI-registry file",
    (core) => {
      expect(walk(core).offenders).toEqual([]);
    },
  );

  it.each(CLAIM_CORES)("%s imports no node:* module itself", (core) => {
    const own = runtimeSpecifiers(readFileSync(core, "utf8")).filter(
      isNodeBuiltin,
    );
    expect(own).toEqual([]);
  });

  it("the claim cores do not import the storage adapter's backing module directly", () => {
    for (const core of CLAIM_CORES) {
      const specs = runtimeSpecifiers(readFileSync(core, "utf8"));
      expect(specs.filter((s) => /^(node:)?fs(\/promises)?$/.test(s))).toEqual(
        [],
      );
    }
  });
});
