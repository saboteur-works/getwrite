/**
 * Feature 108, Task 4 (FR-3, OQ-5, OQ-8): the `claims` manifest entry, off by
 * default, and `"claims"` as a `ViewName`.
 */
import { describe, expect, it } from "vitest";
import { MODULE_MANIFEST } from "../../src/lib/models/modules/manifest";
import {
  createModuleRegistry,
  isModuleEnabled,
} from "../../src/lib/models/modules/registry";
import type { ViewName } from "../../src/lib/models/types";

const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

describe("claims module manifest entry", () => {
  const claims = MODULE_MANIFEST.find((m) => m.id === "claims");

  it("declares claims with a valid id, the Claims view, off by default, no index steps", () => {
    expect(claims).toBeDefined();
    expect(claims?.id).toMatch(MODULE_ID_PATTERN);
    expect(claims?.view).toEqual({ id: "claims", label: "Claims" });
    expect(claims?.defaultEnabled).toBe(false);
    expect(claims?.indexSteps).toEqual([]);
  });

  it("leaves the Sources entry unchanged", () => {
    const sources = MODULE_MANIFEST.find((m) => m.id === "sources");
    expect(sources).toEqual({
      id: "sources",
      view: { id: "sources", label: "Sources" },
      indexSteps: [],
    });
  });

  it("has claims off and Sources on for a project with no config.modules", () => {
    expect(isModuleEnabled(undefined, "claims")).toBe(false);
    expect(isModuleEnabled({}, "claims")).toBe(false);
    expect(isModuleEnabled({}, "sources")).toBe(true);
  });

  it("has both on for { claims: true }", () => {
    const config = { modules: { claims: true } };
    expect(isModuleEnabled(config, "claims")).toBe(true);
    expect(isModuleEnabled(config, "sources")).toBe(true);
  });

  it("lists the Claims view only when enabled", () => {
    const registry = createModuleRegistry(MODULE_MANIFEST);
    expect(registry.enabledViews({}).map((v) => v.id)).toEqual(["sources"]);
    expect(
      registry.enabledViews({ modules: { claims: true } }).map((v) => v.id),
    ).toEqual(["sources", "claims"]);
  });

  it("includes claims in ViewName", () => {
    const view: ViewName = "claims";
    expect(view).toBe("claims");
  });
});
