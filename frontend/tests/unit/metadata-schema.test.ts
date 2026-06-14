import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";

async function readMetadataRevision(dir: string): Promise<number | undefined> {
  const raw = await fs.readFile(path.join(dir, PROJECT_FILENAME), "utf8");
  const proj = JSON.parse(raw) as { config?: { metadataRevision?: number } };
  return proj.config?.metadataRevision;
}
import {
  getSchema,
  addField,
  removeField,
  deprecateField,
  reorderFields,
  renameField,
  updateFieldOptions,
  addGroup,
  removeGroup,
  reorderGroups,
} from "../../src/lib/models/metadata-schema";
import type {
  MetadataField,
  MetadataGroup,
  MetadataSchema,
} from "../../src/lib/models/types";
import { generateUUID } from "../../src/lib/models/uuid";

async function makeTmpProject(schema?: MetadataSchema) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-mschema-"));
  const proj = createProject({ name: "schema-test" });
  const projWithSchema = schema
    ? { ...proj, config: { ...proj.config, metadataSchema: schema } }
    : proj;
  await fs.writeFile(
    path.join(dir, PROJECT_FILENAME),
    JSON.stringify(projWithSchema, null, 2),
    "utf8",
  );
  return { dir };
}

const GROUP_ID = "test-group";
const FIELD: MetadataField = {
  key: "my-field",
  label: "My Field",
  type: "text",
};
const LOCKED_FIELD: MetadataField = {
  key: "locked-field",
  label: "Locked",
  type: "text",
  locked: true,
};

function baseSchema(...extraFields: MetadataField[]): MetadataSchema {
  return {
    groups: [
      { id: GROUP_ID, label: "Test Group", fields: [FIELD, ...extraFields] },
    ],
  };
}

// ---------------------------------------------------------------------------
// getSchema
// ---------------------------------------------------------------------------

describe("getSchema", () => {
  it("returns empty groups when project has no metadataSchema", async () => {
    const { dir } = await makeTmpProject();
    const schema = await getSchema(dir);
    expect(schema).toEqual({ groups: [] });
  });

  it("returns the stored schema when present", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    const schema = await getSchema(dir);
    expect(schema.groups).toHaveLength(1);
    expect(schema.groups[0].id).toBe(GROUP_ID);
  });
});

// ---------------------------------------------------------------------------
// addField
// ---------------------------------------------------------------------------

describe("addField", () => {
  it("appends a field to an existing group", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    const newField: MetadataField = {
      key: "new-field",
      label: "New",
      type: "number",
    };
    const schema = await addField(dir, GROUP_ID, newField);
    const group = schema.groups.find((g) => g.id === GROUP_ID)!;
    expect(group.fields.map((f) => f.key)).toContain("new-field");
  });

  it("persists the added field to disk", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await addField(dir, GROUP_ID, {
      key: "persisted",
      label: "Persisted",
      type: "boolean",
    });
    const schema = await getSchema(dir);
    expect(schema.groups[0].fields.map((f) => f.key)).toContain("persisted");
  });

  it("throws on a key with uppercase letters", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(
      addField(dir, GROUP_ID, { key: "BadKey", label: "Bad", type: "text" }),
    ).rejects.toThrow(/Invalid field key/);
  });

  it("throws on a key with spaces", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(
      addField(dir, GROUP_ID, { key: "bad key", label: "Bad", type: "text" }),
    ).rejects.toThrow(/Invalid field key/);
  });

  it("throws when the key already exists in the schema", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(
      addField(dir, GROUP_ID, {
        key: "my-field",
        label: "Duplicate",
        type: "text",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("throws when the group does not exist", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(
      addField(dir, "nonexistent-group", {
        key: "x",
        label: "X",
        type: "text",
      }),
    ).rejects.toThrow(/Group not found/);
  });
});

// ---------------------------------------------------------------------------
// removeField
// ---------------------------------------------------------------------------

describe("removeField", () => {
  it("removes an unlocked field", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    const schema = await removeField(dir, GROUP_ID, "my-field");
    const group = schema.groups.find((g) => g.id === GROUP_ID)!;
    expect(group.fields.map((f) => f.key)).not.toContain("my-field");
  });

  it("persists the removal to disk", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await removeField(dir, GROUP_ID, "my-field");
    const schema = await getSchema(dir);
    expect(schema.groups[0].fields.map((f) => f.key)).not.toContain("my-field");
  });

  it("throws when trying to remove a locked field", async () => {
    const { dir } = await makeTmpProject(baseSchema(LOCKED_FIELD));
    await expect(removeField(dir, GROUP_ID, "locked-field")).rejects.toThrow(
      /locked/i,
    );
  });

  it("throws when the field does not exist", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(removeField(dir, GROUP_ID, "nonexistent")).rejects.toThrow(
      /Field not found/,
    );
  });

  it("throws when the group does not exist", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(removeField(dir, "bad-group", "my-field")).rejects.toThrow(
      /Group not found/,
    );
  });
});

// ---------------------------------------------------------------------------
// removeField — value preservation (FR6)
// ---------------------------------------------------------------------------

describe("removeField — value preservation (FR6)", () => {
  it("leaves stored sidecar values untouched when a field is removed from the schema", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    const resourceId = generateUUID();
    const metaDir = path.join(dir, "meta");
    await fs.mkdir(metaDir, { recursive: true });
    const sidecarPath = path.join(metaDir, `resource-${resourceId}.meta.json`);
    // A realistic sidecar: user values nest under `userMetadata`.
    await fs.writeFile(
      sidecarPath,
      JSON.stringify(
        {
          id: resourceId,
          name: "Scene",
          type: "text",
          orderIndex: 0,
          folderId: null,
          slug: "scene",
          userMetadata: { "my-field": "keep me" },
        },
        null,
        2,
      ),
      "utf8",
    );
    const before = await fs.readFile(sidecarPath, "utf8");

    await removeField(dir, GROUP_ID, "my-field");

    // The schema entry is gone…
    const schema = await getSchema(dir);
    expect(schema.groups[0].fields.map((f) => f.key)).not.toContain("my-field");
    // …but the sidecar file is untouched, byte for byte — no silent data loss.
    const after = await fs.readFile(sidecarPath, "utf8");
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// deprecateField
// ---------------------------------------------------------------------------

describe("deprecateField", () => {
  it("sets deprecated: true on an unlocked field", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    const schema = await deprecateField(dir, GROUP_ID, "my-field");
    const group = schema.groups.find((g) => g.id === GROUP_ID)!;
    const field = group.fields.find((f) => f.key === "my-field")!;
    expect(field.deprecated).toBe(true);
  });

  it("persists the deprecated flag to disk", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await deprecateField(dir, GROUP_ID, "my-field");
    const schema = await getSchema(dir);
    const field = schema.groups[0].fields.find((f) => f.key === "my-field")!;
    expect(field.deprecated).toBe(true);
  });

  it("keeps the field in the schema (does not remove it)", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    const schema = await deprecateField(dir, GROUP_ID, "my-field");
    const group = schema.groups.find((g) => g.id === GROUP_ID)!;
    expect(group.fields.map((f) => f.key)).toContain("my-field");
  });

  it("throws when trying to deprecate a locked field", async () => {
    const { dir } = await makeTmpProject(baseSchema(LOCKED_FIELD));
    await expect(deprecateField(dir, GROUP_ID, "locked-field")).rejects.toThrow(
      /locked/i,
    );
  });

  it("throws when the field does not exist", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(deprecateField(dir, GROUP_ID, "nonexistent")).rejects.toThrow(
      /Field not found/,
    );
  });

  it("throws when the group does not exist", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(deprecateField(dir, "bad-group", "my-field")).rejects.toThrow(
      /Group not found/,
    );
  });
});

// ---------------------------------------------------------------------------
// reorderFields
// ---------------------------------------------------------------------------

describe("reorderFields", () => {
  it("reorders fields in the specified group", async () => {
    const secondField: MetadataField = {
      key: "second",
      label: "Second",
      type: "date",
    };
    const { dir } = await makeTmpProject(baseSchema(secondField));
    const schema = await reorderFields(dir, GROUP_ID, ["second", "my-field"]);
    const group = schema.groups.find((g) => g.id === GROUP_ID)!;
    expect(group.fields.map((f) => f.key)).toEqual(["second", "my-field"]);
  });

  it("persists the new order to disk", async () => {
    const secondField: MetadataField = {
      key: "second",
      label: "Second",
      type: "date",
    };
    const { dir } = await makeTmpProject(baseSchema(secondField));
    await reorderFields(dir, GROUP_ID, ["second", "my-field"]);
    const schema = await getSchema(dir);
    expect(schema.groups[0].fields.map((f) => f.key)).toEqual([
      "second",
      "my-field",
    ]);
  });

  it("throws when the new order contains unknown keys", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(
      reorderFields(dir, GROUP_ID, ["unknown-key"]),
    ).rejects.toThrow();
  });

  it("throws when the new order length differs from the field count", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(reorderFields(dir, GROUP_ID, [])).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// renameField
// ---------------------------------------------------------------------------

describe("renameField", () => {
  it("updates the label of an existing field", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    const schema = await renameField(
      dir,
      GROUP_ID,
      "my-field",
      "Renamed Label",
    );
    const group = schema.groups.find((g) => g.id === GROUP_ID)!;
    const field = group.fields.find((f) => f.key === "my-field")!;
    expect(field.label).toBe("Renamed Label");
  });

  it("persists the rename to disk", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await renameField(dir, GROUP_ID, "my-field", "Disk Label");
    const schema = await getSchema(dir);
    const field = schema.groups[0].fields.find((f) => f.key === "my-field")!;
    expect(field.label).toBe("Disk Label");
  });

  it("can rename a locked field's label", async () => {
    const { dir } = await makeTmpProject(baseSchema(LOCKED_FIELD));
    const schema = await renameField(
      dir,
      GROUP_ID,
      "locked-field",
      "New Label",
    );
    const field = schema.groups[0].fields.find(
      (f) => f.key === "locked-field",
    )!;
    expect(field.label).toBe("New Label");
  });

  it("throws when the field does not exist", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(renameField(dir, GROUP_ID, "ghost", "Ghost")).rejects.toThrow(
      /Field not found/,
    );
  });
});

// ---------------------------------------------------------------------------
// updateFieldOptions
// ---------------------------------------------------------------------------

describe("updateFieldOptions", () => {
  it("sets options on a select field", async () => {
    const selectField: MetadataField = {
      key: "status",
      label: "Status",
      type: "select",
    };
    const { dir } = await makeTmpProject({
      groups: [{ id: GROUP_ID, label: "G", fields: [selectField] }],
    });
    const schema = await updateFieldOptions(dir, GROUP_ID, "status", [
      "Draft",
      "Final",
    ]);
    const field = schema.groups[0].fields.find((f) => f.key === "status")!;
    expect(field.options).toEqual(["Draft", "Final"]);
  });

  it("persists the updated options to disk", async () => {
    const selectField: MetadataField = {
      key: "status",
      label: "Status",
      type: "select",
    };
    const { dir } = await makeTmpProject({
      groups: [{ id: GROUP_ID, label: "G", fields: [selectField] }],
    });
    await updateFieldOptions(dir, GROUP_ID, "status", ["A", "B"]);
    const schema = await getSchema(dir);
    expect(schema.groups[0].fields[0].options).toEqual(["A", "B"]);
  });

  it("throws when the field does not exist", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(
      updateFieldOptions(dir, GROUP_ID, "ghost", ["x"]),
    ).rejects.toThrow(/Field not found/);
  });
});

// ---------------------------------------------------------------------------
// addGroup
// ---------------------------------------------------------------------------

describe("addGroup", () => {
  it("appends a new group", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    const newGroup: MetadataGroup = {
      id: "new-group",
      label: "New Group",
      fields: [],
    };
    const schema = await addGroup(dir, newGroup);
    expect(schema.groups.map((g) => g.id)).toContain("new-group");
  });

  it("persists the new group to disk", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    const newGroup: MetadataGroup = {
      id: "disk-group",
      label: "Disk Group",
      fields: [],
    };
    await addGroup(dir, newGroup);
    const schema = await getSchema(dir);
    expect(schema.groups.map((g) => g.id)).toContain("disk-group");
  });

  it("initializes metadataSchema from DEFAULT_METADATA_SCHEMA when none exists", async () => {
    const { dir } = await makeTmpProject();
    const group: MetadataGroup = {
      id: "first-group",
      label: "First",
      fields: [],
    };
    const schema = await addGroup(dir, group);
    // schema is seeded from DEFAULT_METADATA_SCHEMA (2 built-in groups) + the new group
    expect(schema.groups.map((g) => g.id)).toContain("first-group");
    expect(schema.groups.map((g) => g.id)).toContain("builtin-document");
  });

  it("throws when the group ID already exists", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(
      addGroup(dir, { id: GROUP_ID, label: "Duplicate", fields: [] }),
    ).rejects.toThrow(/already exists/);
  });
});

// ---------------------------------------------------------------------------
// removeGroup
// ---------------------------------------------------------------------------

describe("removeGroup", () => {
  it("removes an existing group", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    const schema = await removeGroup(dir, GROUP_ID);
    expect(schema.groups.map((g) => g.id)).not.toContain(GROUP_ID);
  });

  it("persists the removal to disk", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await removeGroup(dir, GROUP_ID);
    const schema = await getSchema(dir);
    expect(schema.groups.map((g) => g.id)).not.toContain(GROUP_ID);
  });

  it("throws when the group does not exist", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(removeGroup(dir, "ghost-group")).rejects.toThrow(
      /Group not found/,
    );
  });
});

// ---------------------------------------------------------------------------
// reorderGroups
// ---------------------------------------------------------------------------

describe("reorderGroups", () => {
  it("reorders groups into the specified order", async () => {
    const schema: MetadataSchema = {
      groups: [
        { id: "alpha", label: "Alpha", fields: [] },
        { id: "beta", label: "Beta", fields: [] },
        { id: "gamma", label: "Gamma", fields: [] },
      ],
    };
    const { dir } = await makeTmpProject(schema);
    const result = await reorderGroups(dir, ["gamma", "alpha", "beta"]);
    expect(result.groups.map((g) => g.id)).toEqual(["gamma", "alpha", "beta"]);
  });

  it("persists the new group order to disk", async () => {
    const schema: MetadataSchema = {
      groups: [
        { id: "first", label: "First", fields: [] },
        { id: "second", label: "Second", fields: [] },
      ],
    };
    const { dir } = await makeTmpProject(schema);
    await reorderGroups(dir, ["second", "first"]);
    const result = await getSchema(dir);
    expect(result.groups.map((g) => g.id)).toEqual(["second", "first"]);
  });

  it("throws when the new order contains unknown group IDs", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(reorderGroups(dir, ["ghost"])).rejects.toThrow();
  });

  it("throws when the new order length differs from the group count", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await expect(reorderGroups(dir, [])).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// metadataRevision counter — bumped on every schema write
// ---------------------------------------------------------------------------

describe("metadataRevision counter", () => {
  it("starts at 1 after the first schema mutation", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await addField(dir, GROUP_ID, {
      key: "rev-test",
      label: "Rev",
      type: "text",
    });
    expect(await readMetadataRevision(dir)).toBe(1);
  });

  it("increments on each subsequent mutation", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await addField(dir, GROUP_ID, { key: "a-key", label: "A", type: "text" });
    await addField(dir, GROUP_ID, { key: "b-key", label: "B", type: "number" });
    expect(await readMetadataRevision(dir)).toBe(2);
  });

  it("increments across different mutation types", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await addField(dir, GROUP_ID, { key: "x-key", label: "X", type: "text" });
    await renameField(dir, GROUP_ID, "x-key", "X Renamed");
    await removeField(dir, GROUP_ID, "x-key");
    expect(await readMetadataRevision(dir)).toBe(3);
  });

  it("increments when adding a group", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    await addGroup(dir, { id: "extra-group", label: "Extra", fields: [] });
    expect(await readMetadataRevision(dir)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getSchema — automatic migration of resource-ref { multiple: true }
// ---------------------------------------------------------------------------

describe("getSchema migration: resource-ref multiple:true → multi-resource-ref", () => {
  it("upgrades a resource-ref field with multiple:true to multi-resource-ref", async () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: GROUP_ID,
          label: "Test",
          fields: [
            {
              key: "chars",
              label: "Characters",
              type: "resource-ref",
              multiple: true,
            },
          ],
        },
      ],
    };
    const { dir } = await makeTmpProject(schema);
    const result = await getSchema(dir);
    const field = result.groups[0].fields[0];
    expect(field.type).toBe("multi-resource-ref");
    expect(field.multiple).toBeUndefined();
  });

  it("persists the migration to disk so a second read sees the upgraded type", async () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: GROUP_ID,
          label: "Test",
          fields: [
            {
              key: "chars",
              label: "Characters",
              type: "resource-ref",
              multiple: true,
            },
          ],
        },
      ],
    };
    const { dir } = await makeTmpProject(schema);
    await getSchema(dir);
    const second = await getSchema(dir);
    expect(second.groups[0].fields[0].type).toBe("multi-resource-ref");
  });

  it("does NOT upgrade a resource-ref field with multiple:false", async () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: GROUP_ID,
          label: "Test",
          fields: [
            { key: "pov", label: "POV", type: "resource-ref", multiple: false },
          ],
        },
      ],
    };
    const { dir } = await makeTmpProject(schema);
    const result = await getSchema(dir);
    const field = result.groups[0].fields[0];
    expect(field.type).toBe("resource-ref");
  });

  it("does NOT upgrade a resource-ref field without a multiple property", async () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: GROUP_ID,
          label: "Test",
          fields: [{ key: "pov", label: "POV", type: "resource-ref" }],
        },
      ],
    };
    const { dir } = await makeTmpProject(schema);
    const result = await getSchema(dir);
    expect(result.groups[0].fields[0].type).toBe("resource-ref");
  });

  it("is idempotent — already-migrated multi-resource-ref fields are unchanged", async () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: GROUP_ID,
          label: "Test",
          fields: [
            { key: "chars", label: "Characters", type: "multi-resource-ref" },
          ],
        },
      ],
    };
    const { dir } = await makeTmpProject(schema);
    const result = await getSchema(dir);
    expect(result.groups[0].fields[0].type).toBe("multi-resource-ref");
  });

  it("upgrades only multiple:true fields in a mixed schema", async () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: GROUP_ID,
          label: "Test",
          fields: [
            {
              key: "chars",
              label: "Characters",
              type: "resource-ref",
              multiple: true,
            },
            { key: "pov", label: "POV", type: "resource-ref", multiple: false },
            { key: "title", label: "Title", type: "text" },
          ],
        },
      ],
    };
    const { dir } = await makeTmpProject(schema);
    const result = await getSchema(dir);
    const fields = result.groups[0].fields;
    expect(fields[0].type).toBe("multi-resource-ref");
    expect(fields[0].multiple).toBeUndefined();
    expect(fields[1].type).toBe("resource-ref");
    expect(fields[2].type).toBe("text");
  });
});
