// Last Updated: 2026-11-04

/**
 * Feature 101: client modules added for saved compile/export defaults and
 * annotations must not reach a `node:` built-in through their static imports.
 * Measured defect: `components/common/useSavedDefaults.ts` imported
 * `locked-access.ts`, which imported `crypto/adapter-selection.ts` -> `io.ts`
 * (`node:fs/promises`), and `next dev` failed to chunk the client bundle.
 *
 * Source-level walk of relative static imports and re-exports. Dynamic
 * `import()` is not followed: native backends are loaded that way and
 * replaced by `.web-stub.ts` files in the web build.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

const ENTRIES: string[] = [
  "components/common/useSavedDefaults.ts",
  "components/common/useSaveDefaultsAction.ts",
  "components/common/SavedDefaultsPanel.tsx",
  "components/common/compile-defaults-selection.ts",
  "components/common/CompilePreviewModal.tsx",
  "components/common/ExportPreviewModal.tsx",
  "components/Start/StartPage.tsx",
  "components/Editor/Annotations/AnnotationsPanel.tsx",
  "components/Editor/Annotations/useAnnotationsPanel.ts",
  "src/hooks/useAnnotations.ts",
  "src/lib/api/compile-defaults.ts",
  "src/lib/api/export-defaults.ts",
  "src/lib/api/saved-defaults-read.ts",
  "src/lib/api/annotations.ts",
  "src/lib/models/locked-access.ts",
].map((p) => path.join(ROOT, p));

/**
 * Not followed: the `src/lib/models/index.ts` barrel. Store slices import
 * interfaces from it without the `type` keyword (e.g. `Project` in
 * `projectsSlice.ts`); the compiler elides those, so the barrel is not in the
 * client bundle. A value import from it would not be caught here, which is why
 * the production build is the final check.
 */
const BARREL = "src/lib/models/index.ts";

const STATIC_SPECIFIER = /\b(?:from|import)\s+["']([^"']+)["']/g;
const TYPE_ONLY = /\b(?:import|export)\s+type\b[^;]*?from\s+["']([^"']+)["']/g;

function resolveRelative(from: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(from), specifier);
  return (
    [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(
      (c) => existsSync(c) && statSync(c).isFile(),
    ) ?? null
  );
}

function trace(
  parent: Map<string, string>,
  file: string,
  entry: string,
): string {
  const chain = [file];
  while (chain[0] !== entry && parent.has(chain[0]))
    chain.unshift(parent.get(chain[0]) as string);
  return chain.map((f) => path.relative(ROOT, f)).join(" -> ");
}

function offendersOf(entry: string): string[] {
  const seen = new Set<string>();
  const offenders: string[] = [];
  const parent = new Map<string, string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const typeOnly = new Set([...source.matchAll(TYPE_ONLY)].map((m) => m[1]));
    for (const match of source.matchAll(STATIC_SPECIFIER)) {
      const specifier = match[1];
      if (typeOnly.has(specifier)) continue;
      if (specifier.startsWith("node:") || specifier === "server-only") {
        offenders.push(`${trace(parent, file, entry)} imports ${specifier}`);
      } else if (specifier.startsWith(".")) {
        const resolved = resolveRelative(file, specifier);
        if (
          resolved &&
          !resolved.endsWith(".web-stub.ts") &&
          path.relative(ROOT, resolved) !== BARREL
        ) {
          if (!parent.has(resolved)) parent.set(resolved, file);
          queue.push(resolved);
        }
      }
    }
  }
  return offenders;
}

describe("Feature 101 client modules reach no node: built-in", () => {
  it.each(ENTRIES.map((e) => [path.relative(ROOT, e), e]))(
    "%s",
    (_name, entry) => {
      expect(existsSync(entry)).toBe(true);
      expect(offendersOf(entry)).toEqual([]);
    },
  );
});
