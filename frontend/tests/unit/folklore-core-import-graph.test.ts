/**
 * Feature 110, Task 4 (FR-23): every `src/lib/models/folklore-*.ts` file is
 * model code reachable from the CLI and Electron workers, so it may import no
 * React, JSX, JSON or `node:*` module. Covers later folklore files as they
 * appear. The checker is exercised on synthetic sources so it can fail.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MODELS_DIR = path.resolve(__dirname, "../../src/lib/models");

const SPECIFIER_PATTERNS: RegExp[] = [
  /\b(?:import|export)\s+(?!type\b)(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
];

function runtimeSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

function forbiddenReason(specifier: string): string | null {
  if (specifier === "react" || specifier.startsWith("react/"))
    return "imports react";
  if (specifier === "react-dom" || specifier.startsWith("react-dom/"))
    return "imports react-dom";
  if (/\.(tsx|jsx)$/.test(specifier)) return "imports a JSX file";
  if (/\.json$/.test(specifier)) return "imports a JSON file";
  if (specifier.startsWith("node:")) return "imports a node:* module";
  return null;
}

const FOLKLORE_FILES: string[] = readdirSync(MODELS_DIR)
  .filter((name) => /^folklore-.*\.ts$/.test(name))
  .map((name) => path.join(MODELS_DIR, name));

describe("checker (can fail)", () => {
  it("flags react, JSX, JSON and node:*, skips type-only imports", () => {
    const source = `import React from "react";\nimport x from "./a.json";\nimport fs from "node:fs";\nimport type { T } from "react";\nimport { y } from "./ok";`;
    const reasons = runtimeSpecifiers(source)
      .map(forbiddenReason)
      .filter((r): r is string => r !== null);
    expect(reasons).toEqual([
      "imports react",
      "imports a JSON file",
      "imports a node:* module",
    ]);
  });
});

describe("folklore model files import graph (FR-23)", () => {
  it("finds at least the contract file", () => {
    expect(FOLKLORE_FILES.map((f) => path.basename(f))).toContain(
      "folklore-types.ts",
    );
  });

  it.each(FOLKLORE_FILES)(
    "%s imports no react, JSX, JSON or node:*",
    (file) => {
      const offenders = runtimeSpecifiers(readFileSync(file, "utf8"))
        .map((s) => ({ s, reason: forbiddenReason(s) }))
        .filter((o) => o.reason !== null)
        .map((o) => `${o.reason}: ${o.s}`);
      expect(offenders).toEqual([]);
    },
  );
});
