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

      expect(dryRun.plannedWrites).toHaveLength(2);
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
