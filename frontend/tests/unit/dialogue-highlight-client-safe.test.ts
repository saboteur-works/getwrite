/**
 * The dialogue highlight runs in the browser, so nothing it imports may reach
 * a Node built-in. It once imported `prose-diagnostics.ts`, which reaches
 * `node:fs` through `inverted-index.ts` -> `io.ts`; vitest (Node) and
 * Storybook did not notice, but Next's client bundle failed with a 500
 * ("does not support external modules (request: node:fs)"). This walks the
 * relative import graph from each entry point and fails on any `node:` import.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND = path.resolve(__dirname, "../..");
const ENTRY_POINTS = [
  "components/Editor/Extensions/DialogueHighlightExtension.ts",
  "components/Editor/dialogue-highlight-store.ts",
  "src/lib/models/dialogue-spans.ts",
];

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g;

function resolveRelative(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/** Every Node built-in reached from `entry`, with the file that imports it. */
function nodeImportsReachableFrom(entry: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const queue = [path.join(FRONTEND, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1];
      if (spec.startsWith("node:")) {
        found.push(`${path.relative(FRONTEND, file)} -> ${spec}`);
      } else if (spec.startsWith(".")) {
        const resolved = resolveRelative(file, spec);
        if (resolved) queue.push(resolved);
      }
    }
  }
  return found;
}

describe("dialogue highlight is client-safe", () => {
  it.each(ENTRY_POINTS)("%s reaches no Node built-in", (entry) => {
    expect(nodeImportsReachableFrom(entry)).toEqual([]);
  });

  it("would have caught the original import of prose-diagnostics", () => {
    expect(
      nodeImportsReachableFrom("src/lib/models/prose-diagnostics.ts").length,
    ).toBeGreaterThan(0);
  });
});
