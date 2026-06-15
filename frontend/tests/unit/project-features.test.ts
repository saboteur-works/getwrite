/**
 * Unit tests for the project feature-config persistence helper (Task 4).
 *
 * Verifies that updateFeatureConfig persists `config.features` and
 * `config.organizerCardBody` to project.json under the project lock, merges at
 * the config level while replacing each block wholesale, rejects malformed
 * input, and — critically — never bumps `metadataRevision`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { updateFeatureConfig } from "../../src/lib/models/project-features";
import type { Project } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";

async function makeTmpProject(config?: Project["config"]) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-feature-config-"));
  const project: Project = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "test-project",
    createdAt: "2026-01-01T00:00:00.000Z",
    rootPath: dir,
    config: config ?? { editorConfig: {} },
  };
  await fs.writeFile(
    path.join(dir, PROJECT_FILENAME),
    JSON.stringify(project, null, 2),
    "utf8",
  );
  return dir;
}

async function readProject(dir: string): Promise<Project> {
  const raw = await fs.readFile(path.join(dir, PROJECT_FILENAME), "utf8");
  return JSON.parse(raw) as Project;
}

describe("updateFeatureConfig (Task 4)", () => {
  it("persists config.features to project.json", async () => {
    const dir = await makeTmpProject();
    try {
      await updateFeatureConfig(dir, {
        features: { timeline: true, pov: true },
      });
      const saved = await readProject(dir);
      expect(saved.config?.features).toEqual({ timeline: true, pov: true });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("forces timeline on when timelineView is enabled (invariant: view needs fields)", async () => {
    const dir = await makeTmpProject();
    try {
      // A writer requests the view without the date fields...
      await updateFeatureConfig(dir, { features: { timelineView: true } });
      const saved = await readProject(dir);
      // ...the seam normalizes so the stranded "view on, no fields" state
      // can never be persisted.
      expect(saved.config?.features).toEqual({
        timelineView: true,
        timeline: true,
      });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("persists config.organizerCardBody to project.json", async () => {
    const dir = await makeTmpProject();
    try {
      await updateFeatureConfig(dir, {
        organizerCardBody: { source: "text-excerpt", excerptLength: 120 },
      });
      const saved = await readProject(dir);
      expect(saved.config?.organizerCardBody).toEqual({
        source: "text-excerpt",
        excerptLength: 120,
      });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("merges at the config level — setting features leaves organizerCardBody intact", async () => {
    const dir = await makeTmpProject({
      editorConfig: {},
      organizerCardBody: { source: "field", fieldKey: "synopsis" },
    });
    try {
      await updateFeatureConfig(dir, { features: { synopsis: true } });
      const saved = await readProject(dir);
      expect(saved.config?.features).toEqual({ synopsis: true });
      expect(saved.config?.organizerCardBody).toEqual({
        source: "field",
        fieldKey: "synopsis",
      });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("replaces the features block wholesale on each call", async () => {
    const dir = await makeTmpProject();
    try {
      await updateFeatureConfig(dir, { features: { timeline: true } });
      await updateFeatureConfig(dir, { features: { pov: true } });
      const saved = await readProject(dir);
      expect(saved.config?.features).toEqual({ pov: true });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("does NOT bump metadataRevision", async () => {
    const dir = await makeTmpProject({ editorConfig: {}, metadataRevision: 7 });
    try {
      await updateFeatureConfig(dir, { features: { notes: true } });
      const saved = await readProject(dir);
      expect(saved.config?.metadataRevision).toBe(7);
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("leaves metadataRevision absent when it was never set", async () => {
    const dir = await makeTmpProject();
    try {
      await updateFeatureConfig(dir, { features: { notes: true } });
      const saved = await readProject(dir);
      expect(saved.config?.metadataRevision).toBeUndefined();
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("updates updatedAt on the project document", async () => {
    const dir = await makeTmpProject();
    try {
      const before = Date.now();
      await updateFeatureConfig(dir, { features: { timeline: true } });
      const saved = await readProject(dir);
      expect(saved.updatedAt).toBeDefined();
      expect(new Date(saved.updatedAt!).getTime()).toBeGreaterThanOrEqual(
        before,
      );
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("returns the persisted features and organizerCardBody", async () => {
    const dir = await makeTmpProject({
      editorConfig: {},
      organizerCardBody: { source: "none" },
    });
    try {
      const result = await updateFeatureConfig(dir, {
        features: { synopsis: true },
      });
      expect(result.features).toEqual({ synopsis: true });
      expect(result.organizerCardBody).toEqual({ source: "none" });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("rejects malformed feature flags", async () => {
    const dir = await makeTmpProject();
    try {
      await expect(
        updateFeatureConfig(dir, {
          // @ts-expect-error intentionally malformed
          features: { timeline: "yes" },
        }),
      ).rejects.toThrow();
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("rejects an unknown organizer card-body source", async () => {
    const dir = await makeTmpProject();
    try {
      await expect(
        updateFeatureConfig(dir, {
          // @ts-expect-error intentionally malformed
          organizerCardBody: { source: "bogus" },
        }),
      ).rejects.toThrow();
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("preserves an existing metadataSchema untouched", async () => {
    const schema = {
      groups: [
        {
          id: "g1",
          label: "Group",
          fields: [{ key: "title", label: "Title", type: "text" as const }],
        },
      ],
    };
    const dir = await makeTmpProject({
      editorConfig: {},
      metadataSchema: schema,
    });
    try {
      await updateFeatureConfig(dir, { features: { pov: true } });
      const saved = await readProject(dir);
      expect(saved.config?.metadataSchema).toEqual(schema);
    } finally {
      await removeDirRetry(dir);
    }
  });
});
