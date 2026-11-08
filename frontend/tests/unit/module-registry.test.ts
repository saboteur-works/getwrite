/**
 * Feature 103, Task 3 (FR-2, FR-3 model side, FR-11, OQ-9, OQ-12, OQ-13):
 * the build-time model-side module registry, the static manifest with the
 * Sources module as its first entry, and the pure `isModuleEnabled` helper.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_MANIFEST } from "../../src/lib/models/modules/manifest";
import {
  MODULE_SLOT_KINDS,
  createModuleRegistry,
  isModuleEnabled,
  type ModuleManifestEntry,
} from "../../src/lib/models/modules/registry";

const MODULES_DIR = path.resolve(__dirname, "../../src/lib/models/modules");
const FILES = ["registry.ts", "manifest.ts"];

function source(file: string): string {
  return readFileSync(path.join(MODULES_DIR, file), "utf8");
}

const testModule: ModuleManifestEntry = {
  id: "test-indexed",
  view: { id: "test-indexed", label: "Test indexed" },
  indexSteps: [{ id: "test-step", run: async () => undefined }],
};

describe("module manifest", () => {
  it("is a static list whose first entry is the Sources module with no index", () => {
    expect(Array.isArray(MODULE_MANIFEST)).toBe(true);
    const first = MODULE_MANIFEST[0];
    expect(first.id).toBe("sources");
    expect(first.view).toEqual({ id: "sources", label: "Sources" });
    expect(first.indexSteps).toEqual([]);
  });

  it("has unique module ids", () => {
    const ids = MODULE_MANIFEST.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("isModuleEnabled", () => {
  it("is true when config is absent, modules is absent, or the entry is absent (OQ-13)", () => {
    expect(isModuleEnabled(undefined, "sources")).toBe(true);
    expect(isModuleEnabled({}, "sources")).toBe(true);
    expect(isModuleEnabled({ modules: {} }, "sources")).toBe(true);
    expect(isModuleEnabled({ modules: { other: false } }, "sources")).toBe(
      true,
    );
  });

  it("is false only for an explicit false", () => {
    expect(isModuleEnabled({ modules: { sources: false } }, "sources")).toBe(
      false,
    );
    expect(isModuleEnabled({ modules: { sources: true } }, "sources")).toBe(
      true,
    );
  });

  it("handles an id no registered module has, without throwing", () => {
    expect(isModuleEnabled({ modules: { ghost: false } }, "ghost")).toBe(false);
    expect(isModuleEnabled({ modules: { ghost: true } }, "ghost")).toBe(true);
    expect(isModuleEnabled({ modules: {} }, "ghost")).toBe(true);
  });

  it("does not read inherited object properties as entries", () => {
    expect(isModuleEnabled({ modules: {} }, "toString")).toBe(true);
    expect(isModuleEnabled({ modules: {} }, "__proto__")).toBe(true);
  });
});

describe("createModuleRegistry", () => {
  it("accepts a test-only module with an index step", () => {
    const registry = createModuleRegistry([...MODULE_MANIFEST, testModule]);
    expect(registry.modules.map((m) => m.id)).toEqual([
      "sources",
      "test-indexed",
    ]);
    expect(registry.getModule("test-indexed")).toBe(testModule);
    expect(registry.getModule("missing")).toBeUndefined();
    expect(registry.views().map((v) => v.id)).toEqual([
      "sources",
      "test-indexed",
    ]);
  });

  it("lists index steps only for modules that are enabled", () => {
    const registry = createModuleRegistry([...MODULE_MANIFEST, testModule]);
    expect(registry.indexSteps({}).map((s) => s.id)).toEqual(["test-step"]);
    expect(registry.indexSteps({ modules: { "test-indexed": false } })).toEqual(
      [],
    );
  });

  it("lists views only for enabled modules", () => {
    const registry = createModuleRegistry([...MODULE_MANIFEST, testModule]);
    expect(
      registry.enabledViews({ modules: { sources: false } }).map((v) => v.id),
    ).toEqual(["test-indexed"]);
  });

  it("rejects a duplicate module id", () => {
    expect(() => createModuleRegistry([testModule, testModule])).toThrow(
      /duplicate/i,
    );
  });
});

describe("registry boundary (FR-11, OQ-12)", () => {
  it("declares only the view slot kind", () => {
    expect([...MODULE_SLOT_KINDS]).toEqual(["view"]);
  });

  it("has no field for resource types, Trash kinds, importers, permissions or project-type keys", () => {
    const registry = createModuleRegistry([testModule]);
    const keys = [
      ...Object.keys(registry),
      ...Object.keys(registry.modules[0]),
    ].join(" ");
    for (const forbidden of [
      /resourceType/i,
      /trash/i,
      /importer/i,
      /permission/i,
      /projectType/i,
      /attachment/i,
      /citation/i,
    ]) {
      expect(keys).not.toMatch(forbidden);
    }
  });
});

/** Patterns FR-2 forbids in a registry source file (build-time only). */
const FORBIDDEN_FR2: readonly { name: string; pattern: RegExp }[] = [
  { name: "dynamic import()", pattern: /\bimport\s*\(/ },
  { name: "require()", pattern: /\brequire\s*\(/ },
  {
    name: "store or user-data read",
    pattern:
      /node:fs|from\s+["']fs["']|readFile|userData|getProjectsDir|projects-dir|project-root-resolver/,
  },
];

function fr2Violations(text: string): string[] {
  return FORBIDDEN_FR2.filter(({ pattern }) => pattern.test(text)).map(
    ({ name }) => name,
  );
}

const UI_REGISTRY_FILE = path.resolve(
  __dirname,
  "../../components/Modules/uiRegistry.ts",
);

/** The model-side files plus the UI-side registry (Task 42). */
const FR2_FILES: readonly { label: string; read: () => string }[] = [
  ...FILES.map((file) => ({ label: file, read: () => source(file) })),
  {
    label: "components/Modules/uiRegistry.ts",
    read: () => readFileSync(UI_REGISTRY_FILE, "utf8"),
  },
];

describe("build-time only (FR-2) and no UI imports (FR-4)", () => {
  it.each(FR2_FILES)(
    "$label has no dynamic import() and no store or user-data read",
    ({ read }) => {
      expect(fr2Violations(read())).toEqual([]);
    },
  );

  it("the FR-2 scan flags a dynamic import, a require and a store read (not vacuous)", () => {
    expect(fr2Violations('const m = await import("x");')).toEqual([
      "dynamic import()",
    ]);
    expect(fr2Violations('const m = require("x");')).toEqual(["require()"]);
    expect(fr2Violations('import fs from "node:fs";')).toEqual([
      "store or user-data read",
    ]);
    expect(fr2Violations("const dir = getProjectsDir();")).toEqual([
      "store or user-data read",
    ]);
    expect(fr2Violations('import X from "../Sources/SourcesView";')).toEqual(
      [],
    );
  });

  it("the FR-2 scan flags a temporary copy of uiRegistry.ts with a dynamic import appended", () => {
    const mutated = `${readFileSync(UI_REGISTRY_FILE, "utf8")}\nconst lazy = () => import("../Sources/SourcesView");\n`;
    expect(fr2Violations(mutated)).toEqual(["dynamic import()"]);
  });

  it.each(FILES)("%s imports no React, JSX or JSON", (file) => {
    const text = source(file);
    const specifiers = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    for (const spec of specifiers) {
      expect(spec).not.toMatch(/^react($|\/)/);
      expect(spec).not.toMatch(/\.(tsx|json)$/);
    }
  });
});
