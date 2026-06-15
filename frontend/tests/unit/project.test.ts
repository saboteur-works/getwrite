import { describe, it, expect } from "vitest";
import {
  createProject,
  normalizeProjectConfig,
  validateProject,
} from "../../src/lib/models/project";
import { isValidUUID } from "../../src/lib/models/uuid";

describe("models: createProject / validateProject", () => {
  it("createProject applies defaults and returns a valid project", () => {
    const p = createProject({ name: "My Project" });
    expect(p.name).toBe("My Project");
    expect(typeof p.id).toBe("string");
    expect(isValidUUID(p.id)).toBe(true);
    expect(p.config).toBeTruthy();
    expect(p.config?.maxRevisions).toBe(50);
    expect(p.config?.autoPrune).toBe(true);
    expect(typeof p.createdAt).toBe("string");
  });

  it("validateProject throws on invalid input", () => {
    // Missing required `name` should fail
    expect(() =>
      validateProject({
        id: "00000000-0000-4000-8000-000000000000",
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

describe("models: normalizeProjectConfig", () => {
  it("carries through the feature flags and organizer card-body config", () => {
    const normalized = normalizeProjectConfig({
      editorConfig: {},
      features: { timeline: true, pov: true },
      organizerCardBody: { source: "text-excerpt", excerptLength: 120 },
    });
    expect(normalized.features).toEqual({ timeline: true, pov: true });
    expect(normalized.organizerCardBody).toEqual({
      source: "text-excerpt",
      excerptLength: 120,
    });
  });

  it("leaves the new keys undefined when no config is provided", () => {
    const normalized = normalizeProjectConfig();
    expect(normalized.features).toBeUndefined();
    expect(normalized.organizerCardBody).toBeUndefined();
  });
});
