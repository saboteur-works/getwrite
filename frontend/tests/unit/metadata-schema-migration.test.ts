import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import {
  changeFieldTypeWithMigration,
  updateFieldOptionsWithMigration,
  clearField,
} from "../../src/lib/models/metadata-schema";
import type { MetadataField, MetadataSchema } from "../../src/lib/models/types";
import { generateUUID } from "../../src/lib/models/uuid";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function makeTmpProject(schema: MetadataSchema) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-migr-"));
  const proj = createProject({ name: "migration-test" });
  const projWithSchema = {
    ...proj,
    config: { ...proj.config, metadataSchema: schema },
  };
  await fs.writeFile(
    path.join(dir, PROJECT_FILENAME),
    JSON.stringify(projWithSchema, null, 2),
    "utf8",
  );
  return dir;
}

async function readSidecarRaw(
  dir: string,
  resourceId: string,
): Promise<Record<string, unknown>> {
  const file = path.join(dir, "meta", `resource-${resourceId}.meta.json`);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

const GROUP_ID = "custom-plot";
const FIELD: MetadataField = { key: "tone", label: "Tone", type: "text" };

function simpleSchema(): MetadataSchema {
  return { groups: [{ id: GROUP_ID, label: "Plot", fields: [FIELD] }] };
}

// ─── changeFieldTypeWithMigration ─────────────────────────────────────────────

describe("changeFieldTypeWithMigration", () => {
  it("updates the field type in the schema", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const schema = await changeFieldTypeWithMigration(
      dir,
      GROUP_ID,
      "tone",
      "select",
      [],
      {},
    );
    expect(schema.groups[0].fields[0].type).toBe("select");
  });

  it("sets field.options when the new type is select", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const schema = await changeFieldTypeWithMigration(
      dir,
      GROUP_ID,
      "tone",
      "select",
      ["ominous", "hopeful"],
      {},
    );
    expect(schema.groups[0].fields[0].options).toEqual(["ominous", "hopeful"]);
  });

  it("sets field.options when the new type is multiselect", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const schema = await changeFieldTypeWithMigration(
      dir,
      GROUP_ID,
      "tone",
      "multiselect",
      ["dark", "light"],
      {},
    );
    expect(schema.groups[0].fields[0].options).toEqual(["dark", "light"]);
  });

  it("clears field.options when changing to a non-select type", async () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: GROUP_ID,
          label: "Plot",
          fields: [
            {
              key: "genre",
              label: "Genre",
              type: "select",
              options: ["Fantasy"],
            },
          ],
        },
      ],
    };
    const dir = await makeTmpProject(schema);
    const result = await changeFieldTypeWithMigration(
      dir,
      GROUP_ID,
      "genre",
      "text",
      [],
      {},
    );
    expect(result.groups[0].fields[0].options).toBeUndefined();
  });

  it("rejects a locked field", async () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: GROUP_ID,
          label: "Plot",
          fields: [
            { key: "synopsis", label: "Synopsis", type: "text", locked: true },
          ],
        },
      ],
    };
    const dir = await makeTmpProject(schema);
    await expect(
      changeFieldTypeWithMigration(dir, GROUP_ID, "synopsis", "number", [], {}),
    ).rejects.toThrow(/locked/i);
  });

  it("rejects when the field does not exist", async () => {
    const dir = await makeTmpProject(simpleSchema());
    await expect(
      changeFieldTypeWithMigration(
        dir,
        GROUP_ID,
        "nonexistent",
        "number",
        [],
        {},
      ),
    ).rejects.toThrow(/not found/i);
  });

  it("leaves sidecars untouched when action is 'keep'", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { tone: "ominous" });

    await changeFieldTypeWithMigration(
      dir,
      GROUP_ID,
      "tone",
      "select",
      ["ominous"],
      { ominous: { action: "keep" } },
    );

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["tone"]).toBe("ominous");
  });

  it("deletes the field key from sidecars when action is 'clear'", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { tone: "TBD", other: "keep-me" });

    await changeFieldTypeWithMigration(dir, GROUP_ID, "tone", "select", [], {
      TBD: { action: "clear" },
    });

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["tone"]).toBeUndefined();
    expect(sidecar["other"]).toBe("keep-me");
  });

  it("normalizes the value when action is 'normalize'", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { tone: "Hopeful" });

    await changeFieldTypeWithMigration(
      dir,
      GROUP_ID,
      "tone",
      "select",
      ["hopeful"],
      { Hopeful: { action: "normalize", normalizedTo: "hopeful" } },
    );

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["tone"]).toBe("hopeful");
  });

  it("applies different migrations to different sidecars", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const id1 = generateUUID();
    const id2 = generateUUID();
    const id3 = generateUUID();
    await writeSidecar(dir, id1, { tone: "ominous" });
    await writeSidecar(dir, id2, { tone: "TBD" });
    await writeSidecar(dir, id3, { tone: "Hopeful" });

    await changeFieldTypeWithMigration(
      dir,
      GROUP_ID,
      "tone",
      "select",
      ["ominous", "hopeful"],
      {
        ominous: { action: "keep" },
        TBD: { action: "clear" },
        Hopeful: { action: "normalize", normalizedTo: "hopeful" },
      },
    );

    expect((await readSidecarRaw(dir, id1))["tone"]).toBe("ominous");
    expect((await readSidecarRaw(dir, id2))["tone"]).toBeUndefined();
    expect((await readSidecarRaw(dir, id3))["tone"]).toBe("hopeful");
  });

  it("skips sidecars where the field key is absent", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { other: "value" });

    await changeFieldTypeWithMigration(dir, GROUP_ID, "tone", "number", [], {});

    const sidecar = await readSidecarRaw(dir, id);
    expect("tone" in sidecar).toBe(false);
    expect(sidecar["other"]).toBe("value");
  });

  it("skips sidecars where the field value is null", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { tone: null });

    await changeFieldTypeWithMigration(dir, GROUP_ID, "tone", "select", [], {});

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["tone"]).toBeNull();
  });

  it("does not apply migration when the sidecar value has no matching entry", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { tone: "unknown-value" });

    await changeFieldTypeWithMigration(
      dir,
      GROUP_ID,
      "tone",
      "select",
      [],
      { ominous: { action: "clear" } }, // no entry for "unknown-value"
    );

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["tone"]).toBe("unknown-value");
  });

  it("handles no sidecars in the project gracefully", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const schema = await changeFieldTypeWithMigration(
      dir,
      GROUP_ID,
      "tone",
      "number",
      [],
      {},
    );
    expect(schema.groups[0].fields[0].type).toBe("number");
  });
});

// ─── updateFieldOptionsWithMigration ──────────────────────────────────────────

const SELECT_FIELD: MetadataField = {
  key: "genre",
  label: "Genre",
  type: "select",
  options: ["fantasy", "sci-fi", "horror"],
};
const MULTI_FIELD: MetadataField = {
  key: "tags",
  label: "Tags",
  type: "multiselect",
  options: ["dark", "hopeful", "action"],
};

function selectSchema(): MetadataSchema {
  return { groups: [{ id: GROUP_ID, label: "Plot", fields: [SELECT_FIELD] }] };
}

function multiSchema(): MetadataSchema {
  return { groups: [{ id: GROUP_ID, label: "Plot", fields: [MULTI_FIELD] }] };
}

describe("updateFieldOptionsWithMigration", () => {
  it("updates field.options in the schema to the new options list", async () => {
    const dir = await makeTmpProject(selectSchema());
    const schema = await updateFieldOptionsWithMigration(
      dir,
      GROUP_ID,
      "genre",
      ["fantasy", "sci-fi"],
      {},
    );
    expect(schema.groups[0].fields[0].options).toEqual(["fantasy", "sci-fi"]);
  });

  it("appends add-to-options values to the stored options", async () => {
    const dir = await makeTmpProject(selectSchema());
    const schema = await updateFieldOptionsWithMigration(
      dir,
      GROUP_ID,
      "genre",
      ["fantasy"],
      { horror: { action: "add-to-options" } },
    );
    expect(schema.groups[0].fields[0].options).toEqual(["fantasy", "horror"]);
  });

  it("rejects a non-existent field", async () => {
    const dir = await makeTmpProject(selectSchema());
    await expect(
      updateFieldOptionsWithMigration(dir, GROUP_ID, "nonexistent", [], {}),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects a non-select/non-multiselect field", async () => {
    const dir = await makeTmpProject(simpleSchema()); // tone is text
    await expect(
      updateFieldOptionsWithMigration(dir, GROUP_ID, "tone", [], {}),
    ).rejects.toThrow(/select/i);
  });

  // ── select field sidecar migrations ─────────────────────────────────────────

  it("clears a select value that matches an orphaned option", async () => {
    const dir = await makeTmpProject(selectSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { genre: "horror" });

    await updateFieldOptionsWithMigration(
      dir,
      GROUP_ID,
      "genre",
      ["fantasy", "sci-fi"],
      { horror: { action: "clear" } },
    );

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["genre"]).toBeUndefined();
  });

  it("normalizes a select value to a valid option", async () => {
    const dir = await makeTmpProject(selectSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { genre: "sci-fi" });

    await updateFieldOptionsWithMigration(dir, GROUP_ID, "genre", ["fantasy"], {
      "sci-fi": { action: "normalize", normalizedTo: "fantasy" },
    });

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["genre"]).toBe("fantasy");
  });

  it("leaves a select value unchanged when action is add-to-options", async () => {
    const dir = await makeTmpProject(selectSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { genre: "horror" });

    await updateFieldOptionsWithMigration(dir, GROUP_ID, "genre", ["fantasy"], {
      horror: { action: "add-to-options" },
    });

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["genre"]).toBe("horror");
  });

  it("does not touch select sidecars with a value still in the new options", async () => {
    const dir = await makeTmpProject(selectSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { genre: "fantasy" });

    await updateFieldOptionsWithMigration(dir, GROUP_ID, "genre", ["fantasy"], {
      horror: { action: "clear" },
    });

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["genre"]).toBe("fantasy");
  });

  it("skips select sidecars where the field is null", async () => {
    const dir = await makeTmpProject(selectSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { genre: null });

    await updateFieldOptionsWithMigration(dir, GROUP_ID, "genre", ["fantasy"], {
      horror: { action: "clear" },
    });

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["genre"]).toBeNull();
  });

  // ── multiselect field sidecar migrations ─────────────────────────────────────

  it("removes a matching element from a multiselect array when action is clear", async () => {
    const dir = await makeTmpProject(multiSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { tags: ["dark", "action"] });

    await updateFieldOptionsWithMigration(dir, GROUP_ID, "tags", ["dark"], {
      action: { action: "clear" },
    });

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["tags"]).toEqual(["dark"]);
  });

  it("normalizes a matching element in a multiselect array", async () => {
    const dir = await makeTmpProject(multiSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { tags: ["dark", "hopeful"] });

    await updateFieldOptionsWithMigration(
      dir,
      GROUP_ID,
      "tags",
      ["dark", "positive"],
      { hopeful: { action: "normalize", normalizedTo: "positive" } },
    );

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["tags"]).toEqual(["dark", "positive"]);
  });

  it("leaves a multiselect array element unchanged when action is add-to-options", async () => {
    const dir = await makeTmpProject(multiSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { tags: ["dark", "action"] });

    await updateFieldOptionsWithMigration(dir, GROUP_ID, "tags", ["dark"], {
      action: { action: "add-to-options" },
    });

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["tags"]).toEqual(["dark", "action"]);
  });

  it("deletes the field key when all multiselect elements are cleared", async () => {
    const dir = await makeTmpProject(multiSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { tags: ["action"] });

    await updateFieldOptionsWithMigration(dir, GROUP_ID, "tags", ["dark"], {
      action: { action: "clear" },
    });

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["tags"]).toBeUndefined();
  });

  it("handles no sidecars in the project gracefully", async () => {
    const dir = await makeTmpProject(selectSchema());
    const schema = await updateFieldOptionsWithMigration(
      dir,
      GROUP_ID,
      "genre",
      ["fantasy"],
      {},
    );
    expect(schema.groups[0].fields[0].options).toEqual(["fantasy"]);
  });
});

// ─── clearField ───────────────────────────────────────────────────────────────

describe("clearField", () => {
  it("removes the field from the schema", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const schema = await clearField(dir, GROUP_ID, "tone");
    const group = schema.groups.find((g) => g.id === GROUP_ID)!;
    expect(group.fields.map((f) => f.key)).not.toContain("tone");
  });

  it("deletes the field key from all sidecars", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const id1 = generateUUID();
    const id2 = generateUUID();
    await writeSidecar(dir, id1, { tone: "ominous", other: "keep" });
    await writeSidecar(dir, id2, { tone: "hopeful" });

    await clearField(dir, GROUP_ID, "tone");

    const s1 = await readSidecarRaw(dir, id1);
    const s2 = await readSidecarRaw(dir, id2);
    expect(s1["tone"]).toBeUndefined();
    expect(s1["other"]).toBe("keep");
    expect(s2["tone"]).toBeUndefined();
  });

  it("leaves sidecars without the field key untouched", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const id = generateUUID();
    await writeSidecar(dir, id, { unrelated: "value" });

    await clearField(dir, GROUP_ID, "tone");

    const sidecar = await readSidecarRaw(dir, id);
    expect(sidecar["unrelated"]).toBe("value");
  });

  it("handles no sidecars gracefully", async () => {
    const dir = await makeTmpProject(simpleSchema());
    const schema = await clearField(dir, GROUP_ID, "tone");
    expect(schema.groups[0].fields.map((f) => f.key)).not.toContain("tone");
  });

  it("throws when the field does not exist", async () => {
    const dir = await makeTmpProject(simpleSchema());
    await expect(clearField(dir, GROUP_ID, "nonexistent")).rejects.toThrow(
      /Field not found/,
    );
  });
});
