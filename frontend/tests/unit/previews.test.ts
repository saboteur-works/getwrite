import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generatePreview, loadPreview } from "../../src/lib/models/previews";
import { createAndAssertProject } from "./helpers/project-creator";
import type { TextResource } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";
import * as io from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { runInStorageContext } from "../../src/lib/models/storage-context";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";

describe("models/previews (T028)", () => {
  it("generates and persists an image preview using custom generator", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-pr-"));
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "specs",
        "002-define-data-models",
        "project-types",
        "novel_project_type.json",
      );
      const { projectPath } = await createAndAssertProject(specPath, {
        projectRoot: tmp,
        name: "Preview Test",
      });

      const fakeImage: any = { id: "img-1", type: "image", name: "Pic" };

      await generatePreview(projectPath, fakeImage, {
        image: async (r) => ({
          type: "image",
          width: 32,
          height: 32,
          thumbnail: "data:...",
        }),
      });

      const saved = await loadPreview(projectPath, "img-1");
      expect(saved).not.toBeNull();
      expect((saved as any).type).toBe("image");
      expect((saved as any).width).toBe(32);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("generates and persists a text preview using default generator", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-pr-"));
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "specs",
        "002-define-data-models",
        "project-types",
        "novel_project_type.json",
      );
      const { projectPath } = await createAndAssertProject(specPath, {
        projectRoot: tmp,
        name: "Preview Test",
      });

      const fakeText = {
        id: "txt-1",
        type: "text",
        name: "Note",
        plainText: "hello world this is a preview test",
      } as unknown as TextResource;

      await generatePreview(projectPath, fakeText);

      const saved = await loadPreview(projectPath, "txt-1");
      expect(saved).not.toBeNull();
      expect((saved as any).type).toBe("text");
      expect((saved as any).wordCount).toBeGreaterThan(0);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("rejects rather than degrading to null when the project is locked", async () => {
    const previousAdapter = io.getStorageAdapter();
    try {
      const base = createMemoryAdapter();
      const workspace = "/ws";
      const projectId = "55555555-5555-4555-8555-555555555555";
      const projectRoot = `${workspace}/${projectId}`;
      await base.mkdir(projectRoot, { recursive: true });

      // Opt this project into encryption (marker present) but supply no
      // keyring at all, matching a workspace that is locked/never unlocked —
      // the real `adapterFor` fail-closed path in `workspace-adapter.ts`.
      await writeProjectMarker(projectRoot, base);
      const routedAdapter = workspaceEncryptionAdapter(base, workspace, null);

      await expect(
        runInStorageContext(
          { tenantRoot: workspace, adapter: routedAdapter, projectRoot },
          () => loadPreview(projectRoot, "some-resource-id"),
        ),
      ).rejects.toBeInstanceOf(ProjectLockedError);
    } finally {
      io.setStorageAdapter(previousAdapter);
    }
  });
});
