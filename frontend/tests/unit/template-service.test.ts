import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  inspectResourceTemplate,
  listResourceTemplates,
  loadResourceTemplate,
  saveResourceTemplate,
  scaffoldResourcesFromTemplate,
  validateResourceTemplate,
} from "../../src/lib/models/resource-templates";
import { validateTemplate } from "../../src/lib/models/template-service";
import { ResourceTemplateSchema } from "../../src/lib/models/schemas";
import { readSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

describe("models/template-service regressions (T007)", () => {
  it("returns an empty template list when the template directory has not been created", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-template-list-"),
    );

    try {
      await expect(listResourceTemplates(projectRoot)).resolves.toEqual([]);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("inspects placeholders from template content while surfacing metadata keys separately", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-template-inspect-"),
    );

    try {
      await saveResourceTemplate(projectRoot, {
        id: "tpl-nested-placeholders",
        name: "{{TITLE}}",
        type: "text",
        plainText: "{{TITLE}}\n\n{{SUBTITLE}}",
        userMetadata: { nested: { header: "{{TITLE}}", footer: "{{AUTHOR}}" } },
      });

      const inspection = await inspectResourceTemplate(
        projectRoot,
        "tpl-nested-placeholders",
      );

      expect(inspection.placeholders.sort()).toEqual(["SUBTITLE", "TITLE"]);
      expect(inspection.metadataKeys).toEqual(["nested"]);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("reports schema validation errors for malformed saved templates", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-template-validate-"),
    );

    try {
      const templatesDir = path.join(projectRoot, "meta", "templates");
      await fs.mkdir(templatesDir, { recursive: true });
      await fs.writeFile(
        path.join(templatesDir, "tpl-invalid.json"),
        JSON.stringify({
          id: "tpl-invalid",
          name: "Broken Template",
          type: "folder",
        }),
        "utf8",
      );

      const result = await validateResourceTemplate(projectRoot, "tpl-invalid");

      expect(result.valid).toBe(false);
      if (result.valid) {
        throw new Error("expected validation to fail for malformed template");
      }
      expect(result.errors.some((error) => error.includes("type"))).toBe(true);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("scaffolds multiple resources from one template with sequential names", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-template-scaffold-"),
    );

    try {
      await saveResourceTemplate(projectRoot, {
        id: "tpl-batch",
        name: "Scene",
        type: "text",
        plainText: "Body",
      });

      const createdIds = await scaffoldResourcesFromTemplate(
        projectRoot,
        "tpl-batch",
        3,
      );

      expect(createdIds).toHaveLength(3);
      expect(new Set(createdIds).size).toBe(3);

      const resourceEntries = await fs.readdir(
        path.join(projectRoot, "resources"),
      );
      expect(resourceEntries).toHaveLength(3);

      const sidecars = await Promise.all(
        createdIds.map((resourceId) => readSidecar(projectRoot, resourceId)),
      );
      expect(sidecars).toEqual([
        expect.objectContaining({ name: "Scene 1", type: "text" }),
        expect.objectContaining({ name: "Scene 2", type: "text" }),
        expect.objectContaining({ name: "Scene 3", type: "text" }),
      ]);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });
});

describe("models/template-service resourceSubtype (Feature 73, FR-13/FR-14)", () => {
  const base = { id: "tpl-subtype", name: "Scene", type: "text" as const };

  async function writeRaw(
    projectRoot: string,
    template: Record<string, unknown>,
  ): Promise<void> {
    const dir = path.join(projectRoot, "meta", "templates");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `${String(template.id)}.json`),
      JSON.stringify(template),
      "utf8",
    );
  }

  it.each([
    ["empty string", ""],
    ["whitespace-only string", "   "],
    ["number", 5],
    ["null", null],
  ])(
    "validateResourceTemplate reports resourceSubtype for a %s value",
    async (_label, value) => {
      const projectRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "getwrite-template-subtype-bad-"),
      );
      try {
        await writeRaw(projectRoot, { ...base, resourceSubtype: value });
        const result = await validateResourceTemplate(projectRoot, base.id);
        expect(result.valid).toBe(false);
        if (result.valid) throw new Error("expected invalid");
        expect(result.errors.some((e) => e.startsWith("resourceSubtype"))).toBe(
          true,
        );
      } finally {
        await removeDirRetry(projectRoot);
      }
    },
  );

  it.each([
    ["empty string", ""],
    ["whitespace-only string", "   "],
    ["number", 5],
    ["null", null],
  ])("validateTemplate rejects a %s resourceSubtype", (_label, value) => {
    const result = validateTemplate({
      ...base,
      resourceSubtype: value,
    } as never);
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.some((e) => e.startsWith("resourceSubtype"))).toBe(
      true,
    );
  });

  it("accepts a non-blank resourceSubtype", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-template-subtype-ok-"),
    );
    try {
      await writeRaw(projectRoot, { ...base, resourceSubtype: "Scene" });
      await expect(
        validateResourceTemplate(projectRoot, base.id),
      ).resolves.toEqual({ valid: true });
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("still validates a template saved before the feature, with no resourceSubtype key in the parse result", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-template-subtype-legacy-"),
    );
    try {
      await writeRaw(projectRoot, { ...base });
      await expect(
        validateResourceTemplate(projectRoot, base.id),
      ).resolves.toEqual({ valid: true });
      const parsed = ResourceTemplateSchema.parse({ ...base });
      expect("resourceSubtype" in parsed).toBe(false);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("round-trips resourceSubtype through saveResourceTemplate and loadResourceTemplate", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-template-subtype-rt-"),
    );
    try {
      const tpl = { ...base, resourceSubtype: "Scene" };
      await saveResourceTemplate(projectRoot, tpl);
      await expect(loadResourceTemplate(projectRoot, base.id)).resolves.toEqual(
        tpl,
      );
    } finally {
      await removeDirRetry(projectRoot);
    }
  });
});
