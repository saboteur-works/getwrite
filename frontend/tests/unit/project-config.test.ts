import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadProject,
  loadProjectConfig,
  PROJECT_FILENAME,
} from "../../src/lib/models/project-config";
import { ProjectConfigSchema } from "../../src/lib/models/schemas";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";

describe("models/project-config", () => {
  it("loads project.json and applies defaults to config", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-pcfg-"));
    try {
      const proj = {
        id: generateUUID(),
        name: "CfgTest",
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(tmp, PROJECT_FILENAME),
        JSON.stringify(proj, null, 2),
        "utf8",
      );

      const loaded = await loadProject(tmp);
      expect(loaded.config).toBeTruthy();
      expect(loaded.config?.maxRevisions).toBe(50);
      expect(loaded.config?.autoPrune).toBe(true);

      const cfg = await loadProjectConfig(tmp);
      expect(cfg.maxRevisions).toBe(50);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("preserves metadataRevision through loadProject normalization", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-pcfg-"));
    try {
      const proj = {
        id: generateUUID(),
        name: "RevTest",
        createdAt: new Date().toISOString(),
        config: { metadataRevision: 7, editorConfig: {} },
      };
      await fs.writeFile(
        path.join(tmp, PROJECT_FILENAME),
        JSON.stringify(proj, null, 2),
        "utf8",
      );
      const loaded = await loadProject(tmp);
      expect(loaded.config?.metadataRevision).toBe(7);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("throws when project.json is invalid JSON", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-pcfg-"));
    try {
      await fs.writeFile(path.join(tmp, PROJECT_FILENAME), "not-json", "utf8");
      await expect(loadProject(tmp)).rejects.toThrow();
    } finally {
      await removeDirRetry(tmp);
    }
  });
});

describe("ProjectConfigSchema — metadataRevision", () => {
  it("accepts and preserves metadataRevision", () => {
    const result = ProjectConfigSchema.parse({ metadataRevision: 42 });
    expect(result.metadataRevision).toBe(42);
  });

  it("accepts config without metadataRevision", () => {
    expect(() => ProjectConfigSchema.parse({})).not.toThrow();
  });

  it("rejects negative metadataRevision", () => {
    expect(() => ProjectConfigSchema.parse({ metadataRevision: -1 })).toThrow();
  });

  it("rejects non-integer metadataRevision", () => {
    expect(() =>
      ProjectConfigSchema.parse({ metadataRevision: 1.5 }),
    ).toThrow();
  });
});

describe("ProjectConfigSchema — feature flags", () => {
  it("accepts a fully-specified feature flag map", () => {
    const result = ProjectConfigSchema.parse({
      features: { timeline: true, pov: false, synopsis: true, notes: false },
    });
    expect(result.features).toEqual({
      timeline: true,
      pov: false,
      synopsis: true,
      notes: false,
    });
  });

  it("accepts a partial feature flag map", () => {
    const result = ProjectConfigSchema.parse({ features: { timeline: true } });
    expect(result.features).toEqual({ timeline: true });
  });

  it("accepts config without a feature flag map", () => {
    expect(() => ProjectConfigSchema.parse({})).not.toThrow();
  });

  it("rejects a non-boolean feature flag", () => {
    expect(() =>
      ProjectConfigSchema.parse({ features: { timeline: "yes" } }),
    ).toThrow();
  });
});

describe("ProjectConfigSchema — organizer card body", () => {
  it("accepts a text-excerpt source with a length cap", () => {
    const result = ProjectConfigSchema.parse({
      organizerCardBody: { source: "text-excerpt", excerptLength: 200 },
    });
    expect(result.organizerCardBody).toEqual({
      source: "text-excerpt",
      excerptLength: 200,
    });
  });

  it("accepts a field source with a field key", () => {
    const result = ProjectConfigSchema.parse({
      organizerCardBody: { source: "field", fieldKey: "synopsis" },
    });
    expect(result.organizerCardBody?.source).toBe("field");
    expect(result.organizerCardBody?.fieldKey).toBe("synopsis");
  });

  it("accepts a none source", () => {
    const result = ProjectConfigSchema.parse({
      organizerCardBody: { source: "none" },
    });
    expect(result.organizerCardBody?.source).toBe("none");
  });

  it("rejects an unknown source", () => {
    expect(() =>
      ProjectConfigSchema.parse({ organizerCardBody: { source: "bogus" } }),
    ).toThrow();
  });

  it("rejects a missing source", () => {
    expect(() =>
      ProjectConfigSchema.parse({ organizerCardBody: { excerptLength: 100 } }),
    ).toThrow();
  });

  it("rejects a non-positive excerptLength", () => {
    expect(() =>
      ProjectConfigSchema.parse({
        organizerCardBody: { source: "text-excerpt", excerptLength: 0 },
      }),
    ).toThrow();
  });
});
