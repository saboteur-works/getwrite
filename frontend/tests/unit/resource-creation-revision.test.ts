/**
 * Unit tests for initial canonical revision creation on resource creation (T016).
 *
 * Verifies that creating a text resource via the resource creation flow produces
 * a canonical revision named according to the project's defaultRevisionName setting,
 * and that folder resources are not given an initial revision.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createProject } from "../../src/lib/models/project";
import {
  createTextResource,
  createFolderResource,
} from "../../src/lib/models/resource";
import { writeResourceToFile } from "../../src/lib/models/resource";
import {
  writeRevision,
  getCanonicalRevision,
} from "../../src/lib/models/revision";
import { plainTextToTipTapDocument } from "../../src/lib/models/tiptap-doc";
import { resolveInitialRevisionName } from "../../src/lib/models/resource-revision";
import {
  writeInitialCanonicalRevision,
  writeResourceWithInitialRevision,
} from "../../src/lib/models/resource-initial-revision";
import {
  createImageResource,
  createAudioResource,
} from "../../src/lib/models/resource";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { removeDirRetry } from "./helpers/fs-utils";
import type { ProjectConfig, TipTapDocument } from "../../src/lib/models/types";

async function makeTmpProject(configOverrides?: Partial<ProjectConfig>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rev-create-"));
  const proj = createProject({
    name: "test-project",
    config: { editorConfig: {}, ...configOverrides } as ProjectConfig,
  });
  await fs.writeFile(
    path.join(dir, PROJECT_FILENAME),
    JSON.stringify(proj, null, 2),
    "utf8",
  );
  return { dir, proj };
}

describe("resolveInitialRevisionName", () => {
  it("returns 'Initial Draft' when defaultRevisionName is not configured", () => {
    const config: ProjectConfig = { editorConfig: {} };
    expect(resolveInitialRevisionName(config)).toBe("Initial Draft");
  });

  it("returns the configured name when defaultRevisionName is set", () => {
    const config: ProjectConfig = {
      editorConfig: {},
      defaultRevisionName: "First Draft",
    };
    expect(resolveInitialRevisionName(config)).toBe("First Draft");
  });

  it("falls back to 'Initial Draft' when defaultRevisionName is an empty string", () => {
    const config: ProjectConfig = { editorConfig: {}, defaultRevisionName: "" };
    expect(resolveInitialRevisionName(config)).toBe("Initial Draft");
  });

  it("falls back to 'Initial Draft' when defaultRevisionName is whitespace-only", () => {
    const config: ProjectConfig = {
      editorConfig: {},
      defaultRevisionName: "   ",
    };
    expect(resolveInitialRevisionName(config)).toBe("Initial Draft");
  });
});

describe("resource creation — initial canonical revision (T016)", () => {
  it("creates a canonical revision named 'Initial Draft' by default", async () => {
    const { dir, proj } = await makeTmpProject();
    try {
      const resource = createTextResource({
        name: "Chapter One",
        plainText: "Hello world",
      });
      await writeResourceToFile(dir, resource);

      const revisionName = resolveInitialRevisionName(proj.config!);
      await writeRevision(dir, resource.id, 1, resource.plainText ?? "", {
        isCanonical: true,
        metadata: { name: revisionName },
      });

      const canonical = await getCanonicalRevision(dir, resource.id);
      expect(canonical).not.toBeNull();
      expect(canonical!.isCanonical).toBe(true);
      expect(canonical!.metadata?.name).toBe("Initial Draft");
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("uses the project-configured defaultRevisionName when set", async () => {
    const { dir, proj } = await makeTmpProject({
      defaultRevisionName: "Opening Scene",
    });
    try {
      const resource = createTextResource({
        name: "Chapter One",
        plainText: "",
      });
      await writeResourceToFile(dir, resource);

      const revisionName = resolveInitialRevisionName(proj.config!);
      await writeRevision(dir, resource.id, 1, resource.plainText ?? "", {
        isCanonical: true,
        metadata: { name: revisionName },
      });

      const canonical = await getCanonicalRevision(dir, resource.id);
      expect(canonical?.metadata?.name).toBe("Opening Scene");
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("writes exactly one canonical revision for a new text resource", async () => {
    const { dir, proj } = await makeTmpProject();
    try {
      const resource = createTextResource({ name: "Solo", plainText: "" });
      await writeResourceToFile(dir, resource);

      const revisionName = resolveInitialRevisionName(proj.config!);
      await writeRevision(dir, resource.id, 1, resource.plainText ?? "", {
        isCanonical: true,
        metadata: { name: revisionName },
      });

      const { listRevisions } = await import("../../src/lib/models/revision");
      const all = await listRevisions(dir, resource.id);
      expect(all).toHaveLength(1);
      expect(all.filter((r) => r.isCanonical)).toHaveLength(1);
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("does not create a revision for folder resources (regression guard)", async () => {
    const { dir } = await makeTmpProject();
    try {
      const folder = createFolderResource({ name: "Chapters" });
      await writeResourceToFile(dir, folder);

      const canonical = await getCanonicalRevision(dir, folder.id);
      expect(canonical).toBeNull();
    } finally {
      await removeDirRetry(dir);
    }
  });
});

describe("shared initial-revision writer (Feature 73, Task 1)", () => {
  const doc: TipTapDocument = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
    ],
  };

  async function readV1Content(dir: string, id: string): Promise<string> {
    return fs.readFile(
      path.join(dir, "revisions", id, "v-1", "content.bin"),
      "utf8",
    );
  }

  it("writes v-1 canonical with the default name and the plain text as a TipTap document", async () => {
    const { dir } = await makeTmpProject();
    try {
      const resource = createTextResource({ name: "T", plainText: "Hello" });
      await writeResourceWithInitialRevision(dir, resource);
      const canonical = await getCanonicalRevision(dir, resource.id);
      expect(canonical?.versionNumber).toBe(1);
      expect(canonical?.isCanonical).toBe(true);
      expect(canonical?.metadata?.name).toBe("Initial Draft");
      expect(JSON.parse(await readV1Content(dir, resource.id))).toEqual(
        plainTextToTipTapDocument("Hello"),
      );
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("stores content JSON-equal to the supplied document and uses the configured name", async () => {
    const { dir, proj } = await makeTmpProject({
      defaultRevisionName: "Opening Scene",
    });
    try {
      const resource = createTextResource({ name: "T", plainText: "Hello" });
      await writeResourceToFile(dir, resource);
      await writeInitialCanonicalRevision(dir, resource.id, doc);
      const canonical = await getCanonicalRevision(dir, resource.id);
      expect(canonical?.metadata?.name).toBe(
        resolveInitialRevisionName(proj.config!),
      );
      expect(canonical?.metadata?.name).toBe("Opening Scene");
      expect(JSON.parse(await readV1Content(dir, resource.id))).toEqual(doc);
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("falls back to 'Initial Draft' when project.json is absent", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rev-noproj-"));
    try {
      const resource = createTextResource({ name: "T", plainText: "Hello" });
      await writeResourceWithInitialRevision(dir, resource);
      const canonical = await getCanonicalRevision(dir, resource.id);
      expect(canonical?.metadata?.name).toBe("Initial Draft");
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("falls back to 'Initial Draft' when project.json is unparseable", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rev-badjson-"));
    try {
      // The sidecar write itself parses project.json, so persist the resource
      // first and corrupt the file only for the config read under test.
      const resource = createTextResource({ name: "T", plainText: "Hello" });
      await writeResourceToFile(dir, resource);
      await fs.writeFile(path.join(dir, PROJECT_FILENAME), "{not json", "utf8");
      await writeInitialCanonicalRevision(dir, resource.id, doc);
      const canonical = await getCanonicalRevision(dir, resource.id);
      expect(canonical?.metadata?.name).toBe("Initial Draft");
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("writes no revision for image or audio resources", async () => {
    const { dir } = await makeTmpProject();
    try {
      const image = createImageResource({ name: "I", file: "original.png" });
      const audio = createAudioResource({ name: "A", file: "original.mp3" });
      await writeResourceWithInitialRevision(dir, image);
      await writeResourceWithInitialRevision(dir, audio);
      expect(await getCanonicalRevision(dir, image.id)).toBeNull();
      expect(await getCanonicalRevision(dir, audio.id)).toBeNull();
    } finally {
      await removeDirRetry(dir);
    }
  });
});
