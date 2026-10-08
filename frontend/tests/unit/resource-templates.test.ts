import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  saveResourceTemplate,
  createResourceFromTemplate,
  duplicateResource,
  inspectResourceTemplate,
} from "../../src/lib/models/resource-templates";
import { saveResourceTemplateFromResource } from "../../src/lib/models/resource-templates";
import { createAndAssertProject } from "./helpers/project-creator";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { readSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";
import { loadProjectFromDisk } from "../../src/lib/models/project-loader";
import { getLocalResources } from "../../src/lib/models/resource-persistence";
import { listRevisions } from "../../src/lib/models/revision";

const NOVEL_SPEC_PATH = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

/** Every key `writeResourceToFile` writes to a text resource's sidecar. */
const TEXT_SIDECAR_KEYS = [
  "id",
  "name",
  "type",
  "createdAt",
  "orderIndex",
  "folderId",
  "slug",
  "userMetadata",
  "wordCount",
];

/**
 * Asserts the FR-2 invariants for a resource made by `createResourceFromTemplate`:
 * both project loaders succeed and see it, its content files exist in the
 * per-resource folder, it has a canonical `v-1`, and its sidecar carries the
 * full text key set.
 */
async function expectLoadableTextResource(
  projectPath: string,
  id: string,
  plainText: string,
): Promise<void> {
  const loaded = await loadProjectFromDisk(projectPath);
  const found = loaded.resources.find((r) => r.id === id);
  expect(found).toBeDefined();
  expect(found?.plaintext).toBe(plainText);

  const local = await getLocalResources(projectPath);
  expect(local.some((r) => r.id === id)).toBe(true);

  const base = path.join(projectPath, "resources", id);
  await expect(fs.stat(path.join(base, "content.txt"))).resolves.toBeDefined();
  await expect(
    fs.stat(path.join(base, "content.tiptap.json")),
  ).resolves.toBeDefined();

  const revisions = await listRevisions(projectPath, id);
  expect(revisions).toHaveLength(1);
  expect(revisions[0].versionNumber).toBe(1);
  expect(revisions[0].isCanonical).toBe(true);

  const meta = await readSidecar(projectPath, id);
  expect(meta).not.toBeNull();
  for (const key of TEXT_SIDECAR_KEYS) {
    expect(Object.keys(meta ?? {})).toContain(key);
  }
}

describe("models/resource-templates (T027)", () => {
  // cleanup uses direct recursive removal now that meta writes are serialized
  it("saves a template and creates a resource from it", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt-"));
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
        name: "Template Test",
      });

      const template = {
        id: "tpl-1",
        name: "Template Chapter",
        type: "text" as const,
        plainText: "This is a template",
      };

      await saveResourceTemplate(projectPath, template);
      const created = await createResourceFromTemplate(
        projectPath,
        template.id,
        { name: "From Template" },
      );
      if (!("id" in created)) {
        throw new Error("expected created resource to have an id");
      }

      // sidecar exists for created resource
      const meta = await readSidecar(projectPath, created.id);
      expect(meta).not.toBeNull();
      // FR-2: the created resource is one the project can load and edit
      await expectLoadableTextResource(
        projectPath,
        created.id,
        "This is a template",
      );
      // wait for background indexing to finish before cleanup
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("reports placeholders and dry-run writes without mutating project files", async () => {
    const projectPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-rt-dry-run-"),
    );

    try {
      await saveResourceTemplate(projectPath, {
        id: "tpl-dry-run",
        name: "{{TITLE}}",
        type: "text",
        userMetadata: { section: "intro", tags: ["draft", "template"] },
        plainText: "{{TITLE}}\n\nBody",
      });

      const inspection = await inspectResourceTemplate(
        projectPath,
        "tpl-dry-run",
      );
      expect(inspection.placeholders).toEqual(["TITLE"]);
      expect(inspection.metadataKeys).toEqual(["section", "tags"]);

      const dryRun = await createResourceFromTemplate(
        projectPath,
        "tpl-dry-run",
        { vars: { TITLE: "Opening Scene" }, dryRun: true },
      );

      expect("plannedWrites" in dryRun).toBe(true);
      if (!("plannedWrites" in dryRun)) {
        throw new Error("expected dry-run response");
      }

      expect(dryRun.plannedWrites).toHaveLength(5);
      expect(dryRun.resourcePreview.name).toBe("Opening Scene");
      if (dryRun.resourcePreview.type !== "text") {
        throw new Error("Expected text preview resource in dry-run");
      }
      expect(dryRun.resourcePreview.plainText).toContain("Opening Scene");

      const resourcesDir = path.join(projectPath, "resources");
      const resourceEntries = await fs.readdir(resourcesDir);
      expect(resourceEntries).toEqual([]);
    } finally {
      await removeDirRetry(projectPath);
    }
  });

  it("duplicates an existing resource", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt-"));
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "specs",
        "002-define-data-models",
        "project-types",
        "novel_project_type.json",
      );

      const { projectPath, resources } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "Dup Test" },
      );
      if (resources.length === 0) return;

      const original = resources[0];
      const result = await duplicateResource(projectPath, original.id);
      expect(result.newId).toBeTruthy();
      expect(result.newId).not.toBe(original.id);

      const meta = await readSidecar(projectPath, result.newId);
      expect(meta).not.toBeNull();
      // wait for background indexing to finish before cleanup
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("captures a resource as a template via helper", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt-"));
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "specs",
        "002-define-data-models",
        "project-types",
        "novel_project_type.json",
      );

      const { projectPath, resources } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "Capture Template Test" },
      );
      if (resources.length === 0) return;

      const original = resources[0];
      const tplId = "from-helper";
      await saveResourceTemplateFromResource(projectPath, original.id, tplId, {
        name: "From Helper",
      });

      const tplPath = path.join(
        projectPath,
        "meta",
        "templates",
        `${tplId}.json`,
      );
      const raw = await fs.readFile(tplPath, "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.id).toBe(tplId);
      expect(parsed.name).toBe("From Helper");
      expect(parsed.type).toBe("text");

      // FR-2/FR-26: a resource created from the captured template loads
      const created = await createResourceFromTemplate(projectPath, tplId, {
        name: "From Captured Template",
      });
      if (!("id" in created)) throw new Error("expected a created resource");
      await expectLoadableTextResource(
        projectPath,
        created.id,
        (created as { plainText?: string }).plainText ?? "",
      );
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("parametrizes a template via helper", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt-"));
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
        name: "Param Test",
      });

      const tplId = "tpl-param";
      const template = {
        id: tplId,
        name: "Chapter One",
        type: "text" as const,
        plainText: "Chapter One\n\nContent here",
      };
      await saveResourceTemplate(projectPath, template as any);

      // helper
      const { parametrizeResourceTemplate } =
        await import("../../src/lib/models/resource-templates");
      const vars = await parametrizeResourceTemplate(
        projectPath,
        tplId,
        "{{TITLE}}",
      );
      expect(vars).toContain("TITLE");

      const raw = await fs.readFile(
        path.join(projectPath, "meta", "templates", `${tplId}.json`),
        "utf8",
      );
      const parsed = JSON.parse(raw);
      expect(parsed.name).toBe("{{TITLE}}");
      expect(parsed.plainText.startsWith("{{TITLE}}"));
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("unshipped helper: parametrizeResourceTemplate leaves resourceSubtype intact (FR-25)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt-"));
    try {
      await saveResourceTemplate(tmp, {
        id: "tpl-param-subtype",
        name: "Chapter One",
        type: "text",
        plainText: "Chapter One\n\nContent here",
        resourceSubtype: "Scene",
      });
      const { parametrizeResourceTemplate } =
        await import("../../src/lib/models/resource-templates");
      await parametrizeResourceTemplate(tmp, "tpl-param-subtype", "{{TITLE}}");
      const raw = await fs.readFile(
        path.join(tmp, "meta", "templates", "tpl-param-subtype.json"),
        "utf8",
      );
      const parsed = JSON.parse(raw);
      expect(parsed.name).toBe("{{TITLE}}");
      expect(parsed.resourceSubtype).toBe("Scene");
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("creates from template with vars (dry-run and real)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt-"));
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
        name: "Vars Test",
      });

      const tplId = "tpl-vars";
      const template = {
        id: tplId,
        name: "My {{TITLE}}",
        type: "text" as const,
        plainText: "{{TITLE}}\n\nBody",
      };
      await saveResourceTemplate(projectPath, template as any);

      // dry-run
      const mod = await import("../../src/lib/models/resource-templates");
      const dryRes = (await mod.createResourceFromTemplate(projectPath, tplId, {
        name: undefined,
        vars: { TITLE: "Draft" },
        dryRun: true,
      })) as any;
      const { plannedWrites } = dryRes;
      expect(Array.isArray(plannedWrites)).toBeTruthy();

      // real create
      const result = (await (
        await import("../../src/lib/models/resource-templates")
      ).createResourceFromTemplate(projectPath, tplId, {
        vars: { TITLE: "Final" },
      })) as any;
      expect(result.id).toBeTruthy();

      // wait for background indexing/sidecar writes to finish
      await flushIndexer();

      const resourcesDir = path.join(projectPath, "resources");
      const entries = await fs.readdir(resourcesDir);
      const found = entries.find((e) => e.includes(result.id));
      expect(found).toBeTruthy();
    } finally {
      await removeDirRetry(tmp);
    }
  });
});

describe("models/resource-templates — integrity verification gates (T027-G)", () => {
  it("dryRun returns plannedWrites without writing resource files to disk", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt-dryg-"));
    try {
      const template = {
        id: "tpl-dry",
        name: "Dry Chapter",
        type: "text" as const,
        plainText: "chapter body",
      };
      await saveResourceTemplate(tmp, template);

      const result = await createResourceFromTemplate(tmp, template.id, {
        dryRun: true,
      });

      expect("plannedWrites" in result).toBe(true);
      if (!("plannedWrites" in result)) throw new Error("unreachable");
      expect(result.plannedWrites.length).toBeGreaterThan(0);

      // The resources directory may be created by ensureDir, but no resource
      // content files should be written inside it.
      const resourcesDir = path.join(tmp, "resources");
      const entries = await fs
        .readdir(resourcesDir)
        .catch(() => [] as string[]);
      expect(entries).toHaveLength(0);

      // No sidecar written for the previewed resource
      const metaDir = path.join(tmp, "meta");
      const metaEntries = await fs.readdir(metaDir).catch(() => [] as string[]);
      const sidecars = metaEntries.filter((e) => e.endsWith(".meta.json"));
      expect(sidecars).toHaveLength(0);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("loadResourceTemplate throws when the template file does not exist", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt-miss-"));
    try {
      const { loadResourceTemplate } =
        await import("../../src/lib/models/resource-templates");
      await expect(
        loadResourceTemplate(tmp, "nonexistent-template-id"),
      ).rejects.toThrow();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("scaffoldResourcesFromTemplate creates exactly N resources and returns their ids", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt-scaff-"));
    try {
      const { scaffoldResourcesFromTemplate } =
        await import("../../src/lib/models/resource-templates");

      const template = {
        id: "tpl-scaffold",
        name: "Chapter",
        type: "text" as const,
        plainText: "chapter content",
      };
      await saveResourceTemplate(tmp, template);

      const ids = await scaffoldResourcesFromTemplate(tmp, template.id, 3);

      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);

      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("scaffoldResourcesFromTemplate returns empty array for count <= 0", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt-zero-"));
    try {
      const { scaffoldResourcesFromTemplate } =
        await import("../../src/lib/models/resource-templates");

      const template = {
        id: "tpl-zero",
        name: "Chapter",
        type: "text" as const,
      };
      await saveResourceTemplate(tmp, template);

      const ids = await scaffoldResourcesFromTemplate(tmp, template.id, 0);
      expect(ids).toEqual([]);
    } finally {
      await removeDirRetry(tmp);
    }
  });
});

/** Recursively maps every file under `root` to its content, and every dir to null. */
async function snapshotTree(
  root: string,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  async function walk(dir: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) {
        out[`${rel}/`] = null;
        await walk(full);
      } else {
        out[rel] = await fs.readFile(full, "utf8");
      }
    }
  }
  await walk(root);
  return out;
}

/** Every file path (relative to `root`, id normalised) belonging to resource `id`. */
async function resourceFilePaths(root: string, id: string): Promise<string[]> {
  const tree = await snapshotTree(root);
  return Object.keys(tree)
    .filter((p) => !p.endsWith("/"))
    .filter(
      (p) =>
        p.startsWith(`resources${path.sep}${id}${path.sep}`) ||
        p === path.join("meta", `resource-${id}.meta.json`) ||
        p.startsWith(`revisions${path.sep}${id}${path.sep}`),
    )
    .map((p) => p.split(id).join("<id>"))
    .sort();
}

describe("models/resource-templates — createResourceFromTemplate on the app persistence path (Feature 73)", () => {
  async function makeProject(): Promise<{ tmp: string; projectPath: string }> {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt73-"));
    const { projectPath } = await createAndAssertProject(NOVEL_SPEC_PATH, {
      projectRoot: tmp,
      name: "Template 73",
    });
    await flushIndexer();
    return { tmp, projectPath };
  }

  async function makeBareDir(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rt73-bare-"));
  }

  async function seedFolder(
    root: string,
    params: {
      name: string;
      orderIndex: number;
      parentFolderId?: string | null;
    },
  ): Promise<string> {
    const { createFolderResource } =
      await import("../../src/lib/models/resource-factory");
    const { writeResourceToFile } =
      await import("../../src/lib/models/resource-persistence");
    const folder = createFolderResource(params);
    await writeResourceToFile(root, folder);
    return folder.id;
  }

  async function seedTextResource(
    root: string,
    params: { name: string; orderIndex: number; folderId?: string | null },
  ): Promise<string> {
    const { createResourceOfType } =
      await import("../../src/lib/models/resource-factory");
    const { writeResourceToFile } =
      await import("../../src/lib/models/resource-persistence");
    const res = createResourceOfType("text", { type: "text", ...params });
    await writeResourceToFile(root, res);
    return res.id;
  }

  async function sidecarOf(
    root: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const meta = await readSidecar(root, id);
    if (!meta) throw new Error(`missing sidecar ${id}`);
    return meta as Record<string, unknown>;
  }

  it("FR-2/FR-3: a text template creates a loadable resource in the per-resource layout", async () => {
    const { tmp, projectPath } = await makeProject();
    try {
      await saveResourceTemplate(projectPath, {
        id: "t-load",
        name: "Scene",
        type: "text",
        plainText: "Body of the scene",
      });
      const created = await createResourceFromTemplate(projectPath, "t-load", {
        name: "Loaded",
      });
      if (!("id" in created)) throw new Error("expected a resource");

      await expectLoadableTextResource(
        projectPath,
        created.id,
        "Body of the scene",
      );

      // FR-3: no flat file directly under resources/, no four-key sidecar
      const entries = await fs.readdir(path.join(projectPath, "resources"), {
        withFileTypes: true,
      });
      expect(entries.filter((e) => e.isFile())).toEqual([]);
      const meta = await sidecarOf(projectPath, created.id);
      expect(Object.keys(meta).length).toBeGreaterThan(4);

      // FR-1: the initial revision is named like an app-created one
      const [rev] = await listRevisions(projectPath, created.id);
      expect(rev.metadata?.name).toBe("Initial Draft");
      const revContent = JSON.parse(
        await fs.readFile(
          path.join(projectPath, "revisions", created.id, "v-1", "content.bin"),
          "utf8",
        ),
      );
      expect(revContent.type).toBe("doc");
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-4: folderId is null when the template has none, and the resource lands in an existing template folder", async () => {
    const { tmp, projectPath } = await makeProject();
    try {
      const folderId = await seedFolder(projectPath, {
        name: "Act One",
        orderIndex: 3,
      });
      await saveResourceTemplate(projectPath, {
        id: "t-root",
        name: "Root",
        type: "text",
      });
      await saveResourceTemplate(projectPath, {
        id: "t-null",
        name: "Null folder",
        type: "text",
        folderId: null,
      });
      await saveResourceTemplate(projectPath, {
        id: "t-folder",
        name: "In folder",
        type: "text",
        folderId,
      });

      const root = await createResourceFromTemplate(projectPath, "t-root");
      const nul = await createResourceFromTemplate(projectPath, "t-null");
      const inFolder = await createResourceFromTemplate(
        projectPath,
        "t-folder",
      );
      if (!("id" in root) || !("id" in nul) || !("id" in inFolder)) {
        throw new Error("expected resources");
      }
      expect((await sidecarOf(projectPath, root.id)).folderId).toBeNull();
      expect((await sidecarOf(projectPath, nul.id)).folderId).toBeNull();
      expect((await sidecarOf(projectPath, inFolder.id)).folderId).toBe(
        folderId,
      );
      expect(inFolder.folderId).toBe(folderId);
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-4/FR-33: a folderId naming no existing folder rejects naming template and folder, writing nothing (real and dry run)", async () => {
    const { tmp, projectPath } = await makeProject();
    try {
      const ghost = "11111111-1111-4111-8111-111111111111";
      await saveResourceTemplate(projectPath, {
        id: "t-ghost",
        name: "Ghost",
        type: "text",
        folderId: ghost,
      });
      await flushIndexer();
      const before = await snapshotTree(projectPath);

      for (const isDryRun of [false, true]) {
        const err = await createResourceFromTemplate(projectPath, "t-ghost", {
          dryRun: isDryRun,
        }).then(
          () => null,
          (e: unknown) => e as Error,
        );
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toContain("t-ghost");
        expect(err?.message).toContain(ghost);
      }
      await flushIndexer();
      expect(await snapshotTree(projectPath)).toEqual(before);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-4: orderIndex is one more than the largest sibling among resources and folders sharing the destination parent", async () => {
    const tmp = await makeBareDir();
    try {
      // root: resource 4, folder 7 -> next root index 8
      await seedTextResource(tmp, { name: "R root", orderIndex: 4 });
      const folderF = await seedFolder(tmp, { name: "F", orderIndex: 7 });
      // inside F: resource 2, sub-folder 5 -> next index in F is 6
      await seedTextResource(tmp, {
        name: "R in F",
        orderIndex: 2,
        folderId: folderF,
      });
      await seedFolder(tmp, {
        name: "Sub",
        orderIndex: 5,
        parentFolderId: folderF,
      });
      const folderG = await seedFolder(tmp, {
        name: "Empty",
        orderIndex: 9,
        parentFolderId: null,
      });
      await saveResourceTemplate(tmp, {
        id: "t-root",
        name: "Root",
        type: "text",
      });
      await saveResourceTemplate(tmp, {
        id: "t-f",
        name: "In F",
        type: "text",
        folderId: folderF,
      });
      await saveResourceTemplate(tmp, {
        id: "t-g",
        name: "In G",
        type: "text",
        folderId: folderG,
      });

      const a = await createResourceFromTemplate(tmp, "t-root");
      const inF = await createResourceFromTemplate(tmp, "t-f");
      const inG = await createResourceFromTemplate(tmp, "t-g");
      if (!("id" in a) || !("id" in inF) || !("id" in inG)) {
        throw new Error("expected resources");
      }
      // root holds resource 4 and folders 7 and 9 (G), so the next is 10
      expect((await sidecarOf(tmp, a.id)).orderIndex).toBe(10);
      expect((await sidecarOf(tmp, inF.id)).orderIndex).toBe(6);
      expect((await sidecarOf(tmp, inG.id)).orderIndex).toBe(0);
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-4: consecutive creations get distinct, increasing orderIndex values (scaffold and apply-multiple)", async () => {
    const tmp = await makeBareDir();
    try {
      const { scaffoldResourcesFromTemplate, applyMultipleFromTemplate } =
        await import("../../src/lib/models/resource-templates");
      await saveResourceTemplate(tmp, {
        id: "t-seq",
        name: "Chapter {{N}}",
        type: "text",
      });
      const scaffolded = await scaffoldResourcesFromTemplate(tmp, "t-seq", 3);
      const inputPath = path.join(tmp, "vars.json");
      await fs.writeFile(inputPath, JSON.stringify([{ N: "a" }, { N: "b" }]));
      const applied = await applyMultipleFromTemplate(tmp, "t-seq", inputPath);

      const orders: number[] = [];
      for (const id of [...scaffolded, ...applied]) {
        orders.push((await sidecarOf(tmp, id)).orderIndex as number);
      }
      expect(orders).toEqual([0, 1, 2, 3, 4]);
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-4/FR-33: a project holding an old flat-layout resource rejects creation with a message naming that situation, writing nothing", async () => {
    const tmp = await makeBareDir();
    try {
      await saveResourceTemplate(tmp, { id: "t-ok", name: "Ok", type: "text" });
      const oldId = "22222222-2222-4222-8222-222222222222";
      await fs.mkdir(path.join(tmp, "meta"), { recursive: true });
      await fs.mkdir(path.join(tmp, "resources"), { recursive: true });
      await fs.writeFile(
        path.join(tmp, "meta", `resource-${oldId}.meta.json`),
        JSON.stringify({
          id: oldId,
          name: "Old",
          type: "text",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      );
      await fs.writeFile(
        path.join(tmp, "resources", `old-${oldId}.txt`),
        "old body",
      );
      const before = await snapshotTree(tmp);

      const err = await createResourceFromTemplate(tmp, "t-ok").then(
        () => null,
        (e: unknown) => e as Error,
      );
      expect(err).toBeInstanceOf(Error);
      expect(err?.name).not.toBe("ZodError");
      expect(err?.message).toMatch(/missing required fields/i);
      expect(err?.message).toMatch(/older/i);
      expect(await snapshotTree(tmp)).toEqual(before);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-12: creation does not delete, rewrite or move a pre-existing flat-layout file", async () => {
    const tmp = await makeBareDir();
    try {
      await saveResourceTemplate(tmp, { id: "t-ok", name: "Ok", type: "text" });
      const flat = path.join(tmp, "resources", "legacy-slug-abc.txt");
      await fs.mkdir(path.join(tmp, "resources"), { recursive: true });
      await fs.writeFile(flat, "legacy flat body");
      await createResourceFromTemplate(tmp, "t-ok");
      expect(await fs.readFile(flat, "utf8")).toBe("legacy flat body");
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-26: creation works on a bare temp directory with no project.json", async () => {
    const tmp = await makeBareDir();
    try {
      await saveResourceTemplate(tmp, {
        id: "t-bare",
        name: "Bare",
        type: "text",
        plainText: "bare body",
      });
      const created = await createResourceFromTemplate(tmp, "t-bare");
      if (!("id" in created)) throw new Error("expected a resource");
      const [rev] = await listRevisions(tmp, created.id);
      expect(rev.isCanonical).toBe(true);
      expect(rev.metadata?.name).toBe("Initial Draft");
      await expect(
        fs.stat(path.join(tmp, "project.json")),
      ).rejects.toBeDefined();
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-5: userMetadata equals the template's after {{VAR}} substitution, including string values", async () => {
    const tmp = await makeBareDir();
    try {
      await saveResourceTemplate(tmp, {
        id: "t-meta",
        name: "Meta",
        type: "text",
        userMetadata: { pov: "{{WHO}}", tags: ["draft", "{{WHO}}"], count: 3 },
      });
      const created = await createResourceFromTemplate(tmp, "t-meta", {
        vars: { WHO: "Ada" },
      });
      if (!("id" in created)) throw new Error("expected a resource");
      const expected = { pov: "Ada", tags: ["draft", "Ada"], count: 3 };
      expect(created.userMetadata).toEqual(expected);
      expect((await sidecarOf(tmp, created.id)).userMetadata).toEqual(expected);
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-5: userMetadata is absent on the resource when the template has none", async () => {
    const tmp = await makeBareDir();
    try {
      await saveResourceTemplate(tmp, {
        id: "t-nometa",
        name: "No meta",
        type: "text",
      });
      const created = await createResourceFromTemplate(tmp, "t-nometa");
      if (!("id" in created)) throw new Error("expected a resource");
      expect(created.userMetadata).toBeUndefined();
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-6: a template resourceSubtype is written trimmed to the persisted sidecar and the returned resource", async () => {
    const tmp = await makeBareDir();
    try {
      await saveResourceTemplate(tmp, {
        id: "t-sub",
        name: "Sub",
        type: "text",
        resourceSubtype: "  Scene ",
      });
      const created = await createResourceFromTemplate(tmp, "t-sub");
      if (!("id" in created)) throw new Error("expected a resource");
      expect(created.resourceSubtype).toBe("Scene");
      expect((await sidecarOf(tmp, created.id)).resourceSubtype).toBe("Scene");
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-6: a template with no subtype yields no resourceSubtype key anywhere", async () => {
    const tmp = await makeBareDir();
    try {
      await saveResourceTemplate(tmp, {
        id: "t-nosub",
        name: "No sub",
        type: "text",
      });
      const created = await createResourceFromTemplate(tmp, "t-nosub");
      if (!("id" in created)) throw new Error("expected a resource");
      expect("resourceSubtype" in created).toBe(false);
      expect("resourceSubtype" in (await sidecarOf(tmp, created.id))).toBe(
        false,
      );
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-7: a label not in config.subtypes is still written and the project's subtype list is unchanged", async () => {
    const { tmp, projectPath } = await makeProject();
    try {
      const projectFile = path.join(projectPath, "project.json");
      const project = JSON.parse(await fs.readFile(projectFile, "utf8"));
      project.config = { ...project.config, subtypes: ["Chapter"] };
      await fs.writeFile(projectFile, JSON.stringify(project, null, 2));

      await saveResourceTemplate(projectPath, {
        id: "t-unlisted",
        name: "Unlisted",
        type: "text",
        resourceSubtype: "Scene",
      });
      const created = await createResourceFromTemplate(
        projectPath,
        "t-unlisted",
      );
      if (!("id" in created)) throw new Error("expected a resource");
      await flushIndexer();
      expect((await sidecarOf(projectPath, created.id)).resourceSubtype).toBe(
        "Scene",
      );
      const after = JSON.parse(await fs.readFile(projectFile, "utf8"));
      expect(after.config.subtypes).toEqual(["Chapter"]);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it.each([
    ["empty string", ""],
    ["blank string", "   "],
    ["number", 5],
    ["null", null],
  ])(
    "FR-8/FR-33: a %s resourceSubtype rejects naming the field and the template, writing nothing",
    async (_label, bad) => {
      const tmp = await makeBareDir();
      try {
        await saveResourceTemplate(tmp, {
          id: "t-badsub",
          name: "Bad",
          type: "text",
          resourceSubtype: bad as unknown as string,
        });
        const before = await snapshotTree(tmp);
        for (const isDryRun of [false, true]) {
          const err = await createResourceFromTemplate(tmp, "t-badsub", {
            dryRun: isDryRun,
          }).then(
            () => null,
            (e: unknown) => e as Error,
          );
          expect(err).toBeInstanceOf(Error);
          expect(err?.message).toContain("resourceSubtype");
          expect(err?.message).toContain("t-badsub");
        }
        expect(await snapshotTree(tmp)).toEqual(before);
      } finally {
        await removeDirRetry(tmp);
      }
    },
  );

  it.each([
    ["image", "image", true],
    ["audio", "audio", true],
    ["unknown", "video", false],
  ])(
    "FR-11/FR-33: a %s template type rejects naming the type, writing nothing",
    async (_label, type, namesTemplate) => {
      const tmp = await makeBareDir();
      try {
        await saveResourceTemplate(tmp, {
          id: "t-type",
          name: "Typed",
          type: type as "image",
        });
        const before = await snapshotTree(tmp);
        for (const isDryRun of [false, true]) {
          const err = await createResourceFromTemplate(tmp, "t-type", {
            dryRun: isDryRun,
          }).then(
            () => null,
            (e: unknown) => e as Error,
          );
          expect(err).toBeInstanceOf(Error);
          expect(err?.message).toContain(type);
          if (namesTemplate) expect(err?.message).toContain("t-type");
        }
        expect(await snapshotTree(tmp)).toEqual(before);
      } finally {
        await removeDirRetry(tmp);
      }
    },
  );

  it("FR-9: dry run writes nothing and plans exactly the five files a real run writes", async () => {
    const { tmp, projectPath } = await makeProject();
    try {
      await saveResourceTemplate(projectPath, {
        id: "t-dry73",
        name: "Dry {{X}}",
        type: "text",
        plainText: "Dry body {{X}}",
        userMetadata: { mood: "{{X}}" },
        resourceSubtype: "Scene",
      });
      await flushIndexer();
      const before = await snapshotTree(projectPath);

      const dry = await createResourceFromTemplate(projectPath, "t-dry73", {
        vars: { X: "one" },
        dryRun: true,
      });
      if (!("plannedWrites" in dry)) throw new Error("expected a dry run");
      await flushIndexer();
      expect(await snapshotTree(projectPath)).toEqual(before);

      const id = dry.resourcePreview.id;
      expect(dry.resourcePreview.resourceSubtype).toBe("Scene");
      const rel = (p: string): string => path.relative(projectPath, p);
      expect(dry.plannedWrites.map((w) => rel(w.path)).sort()).toEqual(
        [
          path.join("resources", id, "content.tiptap.json"),
          path.join("resources", id, "content.txt"),
          path.join("meta", `resource-${id}.meta.json`),
          path.join("revisions", id, "v-1", "content.bin"),
          path.join("revisions", id, "v-1", "metadata.json"),
        ].sort(),
      );

      // a real creation with the same inputs writes the same file set
      const real = await createResourceFromTemplate(projectPath, "t-dry73", {
        vars: { X: "one" },
      });
      if (!("id" in real)) throw new Error("expected a resource");
      await flushIndexer();
      const planned = dry.plannedWrites
        .map((w) => rel(w.path).split(id).join("<id>"))
        .sort();
      expect(await resourceFilePaths(projectPath, real.id)).toEqual(planned);

      // the planned sidecar is the exact JSON a real creation writes, apart
      // from the per-instance id and creation timestamp
      const plannedSidecar = dry.plannedWrites.find((w) =>
        w.path.endsWith(".meta.json"),
      );
      const plannedMeta = JSON.parse(plannedSidecar?.content ?? "null");
      const realMeta = await sidecarOf(projectPath, real.id);
      expect(plannedMeta.resourceSubtype).toBe("Scene");
      expect(Object.keys(plannedMeta).sort()).toEqual(
        Object.keys(realMeta).sort(),
      );
      const strip = (m: Record<string, unknown>) => ({
        ...m,
        id: undefined,
        createdAt: undefined,
      });
      expect(strip(plannedMeta)).toEqual(strip(realMeta));
      expect(plannedSidecar?.content).toBe(
        JSON.stringify(plannedMeta, null, 2),
      );
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("FR-10: creation appends no writing-log entry and changes project.json only by the metadataRevision bump", async () => {
    const { tmp, projectPath } = await makeProject();
    try {
      await saveResourceTemplate(projectPath, {
        id: "t-side",
        name: "Side",
        type: "text",
        plainText: "some words here",
      });
      await flushIndexer();
      const projectFile = path.join(projectPath, "project.json");
      const before = JSON.parse(await fs.readFile(projectFile, "utf8"));

      const created = await createResourceFromTemplate(projectPath, "t-side");
      if (!("id" in created)) throw new Error("expected a resource");
      await flushIndexer();

      const logDir = path.join(projectPath, "meta", "writing-log");
      const logEntries = await fs.readdir(logDir).catch(() => [] as string[]);
      expect(logEntries).toEqual([]);

      const after = JSON.parse(await fs.readFile(projectFile, "utf8"));
      const withoutRevision = (p: {
        config: Record<string, unknown>;
      }): unknown => ({
        ...p,
        config: { ...p.config, metadataRevision: undefined },
      });
      expect(withoutRevision(after)).toEqual(withoutRevision(before));
      expect(after.config.metadataRevision).toBe(
        (before.config.metadataRevision ?? 0) + 1,
      );
    } finally {
      await removeDirRetry(tmp);
    }
  });
});
