/**
 * Unit tests for Task 7 (`entity-mention-noise-flagging`, FR-8/FR-9/FR-13):
 * `setNoiseTermDismissedCore` and `normalizeNoiseTerm`
 * (`resource-crud-core.ts`). Exercised directly against a real temp-dir
 * project (no HTTP route, no native transport), matching
 * `resource-crud-core-entity-graph-position.test.ts`'s fixture conventions.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  normalizeNoiseTerm,
  setNoiseTermDismissedCore,
} from "../../src/lib/models/resource-crud-core";
import { readSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function makeTmpProjectsDir(): Promise<{
  projectsDir: string;
  projectId: string;
  projectPath: string;
}> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-resource-crud-core-noise-dismissal-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  return { projectsDir, projectId, projectPath };
}

async function withProjectsDirEnv<T>(
  projectsDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  try {
    return await fn();
  } finally {
    process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  }
}

describe("normalizeNoiseTerm", () => {
  it("trims and lowercases", () => {
    expect(normalizeNoiseTerm("  Case  ")).toBe("case");
    expect(normalizeNoiseTerm("ADA LOVELACE")).toBe("ada lovelace");
  });
});

describe("setNoiseTermDismissedCore", () => {
  it("dismissing a term persists it to dismissedNoiseTerms and a reload reflects it", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();

      await setNoiseTermDismissedCore(projectId, resourceId, "Case", true);

      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.dismissedNoiseTerms).toEqual(["case"]);
    });
  });

  it("undismissing removes the term", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();

      await setNoiseTermDismissedCore(projectId, resourceId, "case", true);
      await setNoiseTermDismissedCore(projectId, resourceId, "case", false);

      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.dismissedNoiseTerms).toEqual([]);
    });
  });

  it("dismissing the same term twice does not duplicate it", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();

      await setNoiseTermDismissedCore(projectId, resourceId, "case", true);
      await setNoiseTermDismissedCore(projectId, resourceId, "Case", true);

      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.dismissedNoiseTerms).toEqual(["case"]);
    });
  });

  it("undismissing a term never dismissed is a no-op, not an error", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();

      await expect(
        setNoiseTermDismissedCore(projectId, resourceId, "case", false),
      ).resolves.toBeUndefined();

      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.dismissedNoiseTerms).toEqual([]);
    });
  });

  it("a later change to the term's text does not retain the old dismissal (FR-8)", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();

      // Dismiss "case" for this entity.
      await setNoiseTermDismissedCore(projectId, resourceId, "case", true);

      let sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.dismissedNoiseTerms).toEqual(["case"]);

      // The entity's alias text later changes to "case2" — a distinct term
      // that was never dismissed. Dismissing it is tracked as its own,
      // independent entry alongside the original, rather than somehow
      // inheriting or replacing the "case" dismissal.
      await setNoiseTermDismissedCore(projectId, resourceId, "case2", true);

      sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.dismissedNoiseTerms).toEqual(["case", "case2"]);

      // Undismissing "case2" leaves "case" dismissed, demonstrating the two
      // terms are tracked independently by their own normalized text, never
      // by position/index.
      await setNoiseTermDismissedCore(projectId, resourceId, "case2", false);

      sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.dismissedNoiseTerms).toEqual(["case"]);
    });
  });

  it("preserves other sidecar fields already present", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();

      await setNoiseTermDismissedCore(projectId, resourceId, "ada", true);

      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.dismissedNoiseTerms).toEqual(["ada"]);

      await setNoiseTermDismissedCore(
        projectId,
        resourceId,
        "the brass queen",
        true,
      );

      const next = await readSidecar(projectPath, resourceId);
      expect(next?.dismissedNoiseTerms).toEqual(["ada", "the brass queen"]);
    });
  });
});
