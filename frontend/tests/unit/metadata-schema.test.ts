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
  getEffectiveResourceRefFieldKeys,
  addField,
  removeField,
  clearField,
  deprecateField,
  reorderFields,
  renameField,
  renameFieldKey,
  updateFieldOptions,
  changeFieldType,
  addGroup,
  removeGroup,
  reorderGroups,
  renameGroup,
} from "../../src/lib/models/metadata-schema";
import type {
  MetadataField,
  MetadataGroup,
  MetadataSchema,
} from "../../src/lib/models/types";
import { generateUUID } from "../../src/lib/models/uuid";
import { withFileLock } from "../../src/lib/models/file-lock";
import {
  changeFieldTypeWithMigration,
  updateFieldAppliesTo,
  updateFieldOptionsWithMigration,
  updateRefProperties,
} from "../../src/lib/models/metadata-schema";

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
// clearField — deletes the nested userMetadata value (destructive path)
// ---------------------------------------------------------------------------

describe("clearField", () => {
  it("deletes the field's value from userMetadata while preserving siblings", async () => {
    const { dir } = await makeTmpProject(baseSchema());
    const resourceId = generateUUID();
    const metaDir = path.join(dir, "meta");
    await fs.mkdir(metaDir, { recursive: true });
    const sidecarPath = path.join(metaDir, `resource-${resourceId}.meta.json`);
    // Canonical sidecar: user values nest under `userMetadata`.
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
          userMetadata: { "my-field": "delete me", keep: "stay" },
        },
        null,
        2,
      ),
      "utf8",
    );

    await clearField(dir, GROUP_ID, "my-field");

    // Schema entry removed…
    const schema = await getSchema(dir);
    expect(schema.groups[0].fields.map((f) => f.key)).not.toContain("my-field");

    // …and the stored value is actually gone, with siblings untouched.
    const sidecar = JSON.parse(await fs.readFile(sidecarPath, "utf8")) as {
      userMetadata: Record<string, unknown>;
    };
    expect(sidecar.userMetadata["my-field"]).toBeUndefined();
    expect(sidecar.userMetadata.keep).toBe("stay");
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

describe("sidecar key resourceSubtype cannot collide with a custom field (Feature 72, FR-6)", () => {
  it("addField rejects the key resourceSubtype", async () => {
    const { dir } = await makeTmpProject({
      groups: [{ id: GROUP_ID, label: "G", fields: [] }],
    });
    await expect(
      addField(dir, GROUP_ID, {
        key: "resourceSubtype",
        label: "Subtype",
        type: "text",
      }),
    ).rejects.toThrow(/Invalid field key/);
  });

  it("renameFieldKey rejects renaming a field to resourceSubtype", async () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: GROUP_ID,
          label: "G",
          fields: [{ key: "my-field", label: "My Field", type: "text" }],
        },
      ],
    };
    const { dir } = await makeTmpProject(schema);
    await expect(
      renameFieldKey(dir, GROUP_ID, "my-field", "resourceSubtype"),
    ).rejects.toThrow(/Invalid field key/);
  });
});

// ---------------------------------------------------------------------------
// Feature 72, FR-17: existing schema operations preserve a field's `appliesTo`
// ---------------------------------------------------------------------------

describe("appliesTo is preserved by existing schema operations (FR-17)", () => {
  const RESTRICTED: MetadataField = {
    key: "mood",
    label: "Mood",
    type: "select",
    options: ["Calm"],
    appliesTo: ["Scene", "Chapter"],
  };
  const OTHER: MetadataField = { key: "other", label: "Other", type: "text" };

  async function restrictedProject() {
    return makeTmpProject({
      groups: [{ id: GROUP_ID, label: "G", fields: [RESTRICTED, OTHER] }],
    });
  }

  function mood(schema: MetadataSchema): MetadataField | undefined {
    return schema.groups[0].fields.find((f) => f.key === "mood");
  }

  async function storedMood(dir: string): Promise<MetadataField | undefined> {
    return mood(await getSchema(dir));
  }

  it("rename label", async () => {
    const { dir } = await restrictedProject();
    const schema = await renameField(dir, GROUP_ID, "mood", "Feeling");
    expect(mood(schema)?.appliesTo).toEqual(["Scene", "Chapter"]);
    expect((await storedMood(dir))?.appliesTo).toEqual(["Scene", "Chapter"]);
  });

  it("rename key", async () => {
    const { dir } = await restrictedProject();
    const schema = await renameFieldKey(dir, GROUP_ID, "mood", "feeling");
    const renamed = schema.groups[0].fields.find((f) => f.key === "feeling");
    expect(renamed?.appliesTo).toEqual(["Scene", "Chapter"]);
    const stored = (await getSchema(dir)).groups[0].fields.find(
      (f) => f.key === "feeling",
    );
    expect(stored?.appliesTo).toEqual(["Scene", "Chapter"]);
  });

  it("reorder", async () => {
    const { dir } = await restrictedProject();
    const schema = await reorderFields(dir, GROUP_ID, ["other", "mood"]);
    expect(schema.groups[0].fields.map((f) => f.key)).toEqual([
      "other",
      "mood",
    ]);
    expect(mood(schema)?.appliesTo).toEqual(["Scene", "Chapter"]);
    expect((await storedMood(dir))?.appliesTo).toEqual(["Scene", "Chapter"]);
  });

  it("change type (without migration)", async () => {
    const { dir } = await restrictedProject();
    const schema = await changeFieldType(dir, GROUP_ID, "mood", "text");
    expect(mood(schema)?.type).toBe("text");
    expect(mood(schema)?.appliesTo).toEqual(["Scene", "Chapter"]);
    expect((await storedMood(dir))?.appliesTo).toEqual(["Scene", "Chapter"]);
  });

  it("options update", async () => {
    const { dir } = await restrictedProject();
    const schema = await updateFieldOptions(dir, GROUP_ID, "mood", [
      "Calm",
      "Tense",
    ]);
    expect(mood(schema)?.options).toEqual(["Calm", "Tense"]);
    expect(mood(schema)?.appliesTo).toEqual(["Scene", "Chapter"]);
    expect((await storedMood(dir))?.appliesTo).toEqual(["Scene", "Chapter"]);
  });
});

describe("getEffectiveResourceRefFieldKeys", () => {
  it("includes built-in pov for a project with no persisted schema, and leaves project.json byte-identical", async () => {
    const { dir } = await makeTmpProject();
    const file = path.join(dir, PROJECT_FILENAME);
    const before = await fs.readFile(file, "utf8");
    const keys = await getEffectiveResourceRefFieldKeys(dir);
    expect(keys).toContain("pov");
    expect(await fs.readFile(file, "utf8")).toBe(before);
  });

  it("uses a persisted schema's fields alone: a persisted schema lacking pov yields no pov key", async () => {
    const { dir } = await makeTmpProject({
      groups: [
        {
          id: "g",
          label: "G",
          fields: [{ key: "ref", label: "Ref", type: "resource-ref" }],
        },
      ],
    });
    const keys = await getEffectiveResourceRefFieldKeys(dir);
    expect(keys).toEqual(["ref"]);
  });

  it("uses a persisted custom ref field and lets a persisted definition win over the built-in", async () => {
    const { dir } = await makeTmpProject({
      groups: [
        {
          id: "g",
          label: "G",
          fields: [
            { key: "ref", label: "Ref", type: "resource-ref" },
            { key: "pov", label: "POV", type: "text" },
          ],
        },
      ],
    });
    const keys = await getEffectiveResourceRefFieldKeys(dir);
    expect(keys).toContain("ref");
    expect(keys).not.toContain("pov");
  });

  it("rejects when project.json is unreadable", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-mschema-"));
    await expect(getEffectiveResourceRefFieldKeys(dir)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// renameGroup
// ---------------------------------------------------------------------------

describe("renameGroup", () => {
  function twoGroups(): MetadataSchema {
    return {
      groups: [
        { id: GROUP_ID, label: "Test Group", fields: [FIELD] },
        { id: "other", label: "Characters", fields: [] },
      ],
    };
  }

  it("changes the label, trimmed, keeps the id and persists it", async () => {
    const { dir } = await makeTmpProject(twoGroups());
    const schema = await renameGroup(dir, GROUP_ID, "  Places  ");
    expect(schema.groups[0]).toMatchObject({ id: GROUP_ID, label: "Places" });
    expect((await getSchema(dir)).groups[0].label).toBe("Places");
  });

  it("renames a built-in group's label", async () => {
    const { dir } = await makeTmpProject();
    const schema = await renameGroup(dir, "builtin-document", "Doc Info");
    expect(schema.groups.find((g) => g.id === "builtin-document")?.label).toBe(
      "Doc Info",
    );
  });

  it.each(["", "   "])(
    "refuses a blank name %j and leaves the label",
    async (label) => {
      const { dir } = await makeTmpProject(twoGroups());
      await expect(renameGroup(dir, GROUP_ID, label)).rejects.toThrow(
        "Group name must not be blank.",
      );
      expect((await getSchema(dir)).groups[0].label).toBe("Test Group");
    },
  );

  it.each(["Characters", " characters "])(
    "refuses %j, a name another group uses, ignoring case and spaces",
    async (label) => {
      const { dir } = await makeTmpProject(twoGroups());
      await expect(renameGroup(dir, GROUP_ID, label)).rejects.toThrow(
        "A group named \u201cCharacters\u201d already exists.",
      );
    },
  );

  it("allows a change of case to its own name", async () => {
    const { dir } = await makeTmpProject(twoGroups());
    const schema = await renameGroup(dir, GROUP_ID, "TEST GROUP");
    expect(schema.groups[0].label).toBe("TEST GROUP");
  });

  it("throws when the group does not exist", async () => {
    const { dir } = await makeTmpProject(twoGroups());
    await expect(renameGroup(dir, "ghost", "X")).rejects.toThrow(
      /Group not found/,
    );
  });
});

// ---------------------------------------------------------------------------
// withLockedSchema on the per-file lock (Feature 92, Task 11; FR-2, FR-4)
// ---------------------------------------------------------------------------

describe("the 13 withLockedSchema operations on the project.json file lock", () => {
  const SELECT: MetadataField = {
    key: "pick",
    label: "Pick",
    type: "select",
    options: ["a", "b"],
  };
  const REF: MetadataField = {
    key: "link",
    label: "Link",
    type: "multi-resource-ref",
  };
  const OTHER: MetadataField = { key: "other", label: "Other", type: "text" };
  function fixedSchema(): MetadataSchema {
    return {
      groups: [
        {
          id: GROUP_ID,
          label: "Test Group",
          fields: [FIELD, SELECT, REF, OTHER],
        },
        { id: "second-group", label: "Second", fields: [] },
      ],
    };
  }

  const NEW_FIELD: MetadataField = {
    key: "added",
    label: "Added",
    type: "text",
  };
  const OPERATIONS: ReadonlyArray<{
    name: string;
    run: (dir: string) => Promise<MetadataSchema>;
    fail: (dir: string) => Promise<MetadataSchema>;
  }> = [
    {
      name: "addField",
      run: (d) => addField(d, GROUP_ID, NEW_FIELD),
      fail: (d) => addField(d, GROUP_ID, FIELD),
    },
    {
      name: "removeField",
      run: (d) => removeField(d, GROUP_ID, "other"),
      fail: (d) => removeField(d, GROUP_ID, "nope"),
    },
    {
      name: "deprecateField",
      run: (d) => deprecateField(d, GROUP_ID, "other"),
      fail: (d) => deprecateField(d, GROUP_ID, "nope"),
    },
    {
      name: "reorderFields",
      run: (d) =>
        reorderFields(d, GROUP_ID, ["other", "link", "pick", "my-field"]),
      fail: (d) => reorderFields(d, GROUP_ID, ["other"]),
    },
    {
      name: "renameField",
      run: (d) => renameField(d, GROUP_ID, "other", "Renamed"),
      fail: (d) => renameField(d, GROUP_ID, "nope", "Renamed"),
    },
    {
      name: "updateFieldOptions",
      run: (d) => updateFieldOptions(d, GROUP_ID, "pick", ["x", "y"]),
      fail: (d) => updateFieldOptions(d, GROUP_ID, "nope", ["x"]),
    },
    {
      name: "addGroup",
      run: (d) => addGroup(d, { id: "third", label: "Third", fields: [] }),
      fail: (d) => addGroup(d, { id: GROUP_ID, label: "Dup", fields: [] }),
    },
    {
      name: "renameGroup",
      run: (d) => renameGroup(d, "second-group", "Second Renamed"),
      fail: (d) => renameGroup(d, "nope", "X"),
    },
    {
      name: "removeGroup",
      run: (d) => removeGroup(d, "second-group"),
      fail: (d) => removeGroup(d, "nope"),
    },
    {
      name: "reorderGroups",
      run: (d) => reorderGroups(d, ["second-group", GROUP_ID]),
      fail: (d) => reorderGroups(d, [GROUP_ID]),
    },
    {
      name: "updateRefProperties",
      run: (d) =>
        updateRefProperties(d, GROUP_ID, "link", { maxSelections: 3 }),
      fail: (d) => updateRefProperties(d, GROUP_ID, "nope", {}),
    },
    {
      name: "updateFieldAppliesTo",
      run: (d) => updateFieldAppliesTo(d, GROUP_ID, "other", ["Scene"]),
      fail: (d) => updateFieldAppliesTo(d, GROUP_ID, "nope", ["Scene"]),
    },
    {
      name: "changeFieldType",
      run: (d) => changeFieldType(d, GROUP_ID, "other", "number"),
      fail: (d) => changeFieldType(d, GROUP_ID, "nope", "number"),
    },
  ];

  async function readRaw(dir: string): Promise<string> {
    return fs.readFile(path.join(dir, PROJECT_FILENAME), "utf8");
  }

  it.each(OPERATIONS)(
    "$name writes the schema it returns, bumps metadataRevision once, and keeps key order",
    async ({ run }) => {
      const { dir } = await makeTmpProject(fixedSchema());
      const before = JSON.parse(await readRaw(dir)) as {
        config: Record<string, unknown>;
      };
      const returned = await run(dir);
      const expected = structuredClone(before);
      expected.config.metadataSchema = returned;
      expected.config.metadataRevision = 1;
      expect(await readRaw(dir)).toBe(JSON.stringify(expected, null, 2));
    },
  );

  it.each(OPERATIONS)(
    "$name writes nothing and does not bump metadataRevision when it throws",
    async ({ fail }) => {
      const { dir } = await makeTmpProject(fixedSchema());
      const before = await readRaw(dir);
      await expect(fail(dir)).rejects.toThrow();
      expect(await readRaw(dir)).toBe(before);
    },
  );

  it.each(OPERATIONS)(
    "$name does not read or write project.json while another writer holds the file lock",
    async ({ run }) => {
      const { dir } = await makeTmpProject(fixedSchema());
      const file = path.join(dir, PROJECT_FILENAME);
      let op: Promise<MetadataSchema> | undefined;
      let hasSettled = false;
      let heldContent = "";
      let contentAfterWait = "";
      await withFileLock(file, async () => {
        heldContent = await fs.readFile(file, "utf8");
        op = run(dir).finally(() => {
          hasSettled = true;
        });
        // Time for the operation to take its outer lock and, if it does not
        // wait for the file lock, to read and write.
        await new Promise((r) => setTimeout(r, 40));
        contentAfterWait = await fs.readFile(file, "utf8");
        expect(hasSettled).toBe(false);
      });
      expect(contentAfterWait).toBe(heldContent);
      await op;
      expect(await readMetadataRevision(dir)).toBe(1);
    },
  );
});

describe("the three migration operations write the schema on the project.json file lock", () => {
  const SELECT: MetadataField = {
    key: "pick",
    label: "Pick",
    type: "select",
    options: ["a", "b"],
  };
  const OTHER: MetadataField = { key: "other", label: "Other", type: "text" };
  const schema = (): MetadataSchema => ({
    groups: [{ id: GROUP_ID, label: "Test Group", fields: [SELECT, OTHER] }],
  });
  const OPERATIONS: ReadonlyArray<{
    name: string;
    run: (dir: string) => Promise<MetadataSchema>;
    fail: (dir: string) => Promise<MetadataSchema>;
  }> = [
    {
      name: "renameFieldKey",
      run: (d) => renameFieldKey(d, GROUP_ID, "other", "renamed"),
      fail: (d) => renameFieldKey(d, GROUP_ID, "other", "pick"),
    },
    {
      name: "changeFieldTypeWithMigration",
      run: (d) =>
        changeFieldTypeWithMigration(d, GROUP_ID, "other", "number", [], {}),
      fail: (d) =>
        changeFieldTypeWithMigration(d, GROUP_ID, "nope", "number", [], {}),
    },
    {
      name: "updateFieldOptionsWithMigration",
      run: (d) =>
        updateFieldOptionsWithMigration(d, GROUP_ID, "pick", ["x"], {
          a: { action: "add-to-options" },
        }),
      fail: (d) =>
        updateFieldOptionsWithMigration(d, GROUP_ID, "other", ["x"], {}),
    },
  ];

  async function readRaw(dir: string): Promise<string> {
    return fs.readFile(path.join(dir, PROJECT_FILENAME), "utf8");
  }

  it.each(OPERATIONS)(
    "$name writes the schema it returns and bumps metadataRevision once",
    async ({ run }) => {
      const { dir } = await makeTmpProject(schema());
      const before = JSON.parse(await readRaw(dir)) as {
        config: Record<string, unknown>;
      };
      const returned = await run(dir);
      const expected = structuredClone(before);
      expected.config.metadataSchema = returned;
      expected.config.metadataRevision = 1;
      expect(await readRaw(dir)).toBe(JSON.stringify(expected, null, 2));
    },
  );

  it.each(OPERATIONS)(
    "$name writes nothing when it throws",
    async ({ fail }) => {
      const { dir } = await makeTmpProject(schema());
      const before = await readRaw(dir);
      await expect(fail(dir)).rejects.toThrow();
      expect(await readRaw(dir)).toBe(before);
    },
  );

  it.each(OPERATIONS)(
    "$name does not read or write project.json while another writer holds the file lock",
    async ({ run }) => {
      const { dir } = await makeTmpProject(schema());
      const file = path.join(dir, PROJECT_FILENAME);
      let op: Promise<MetadataSchema> | undefined;
      let hasSettled = false;
      let heldContent = "";
      let contentAfterWait = "";
      await withFileLock(file, async () => {
        heldContent = await fs.readFile(file, "utf8");
        op = run(dir).finally(() => {
          hasSettled = true;
        });
        await new Promise((r) => setTimeout(r, 40));
        contentAfterWait = await fs.readFile(file, "utf8");
        expect(hasSettled).toBe(false);
      });
      expect(contentAfterWait).toBe(heldContent);
      await op;
      expect(await readMetadataRevision(dir)).toBe(1);
    },
  );
});
