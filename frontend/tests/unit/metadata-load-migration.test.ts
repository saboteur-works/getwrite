import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { migrateProjectOnLoad } from "../../src/lib/models/metadata-schema";
import { loadProjectFromDisk } from "../../src/lib/models/project-loader";
import { generateUUID } from "../../src/lib/models/uuid";
import type {
  MetadataSchema,
  MetadataValue,
  Project,
  ProjectConfig,
} from "../../src/lib/models/types";

// ─── fixtures ───────────────────────────────────────────────────────────────

/** The built-in schema exactly as older projects persisted it (pre-unlock). */
function oldLockedSchema(): MetadataSchema {
  return {
    groups: [
      {
        id: "builtin-document",
        label: "Document",
        fields: [
          { key: "synopsis", label: "Synopsis", type: "text", locked: true },
          { key: "notes", label: "Notes", type: "text", locked: true },
          { key: "status", label: "Status", type: "select", locked: true },
          {
            key: "pov",
            label: "Point of View",
            type: "resource-ref",
            locked: true,
            multiple: false,
          },
        ],
      },
      {
        id: "builtin-story-timeline",
        label: "Story Timeline",
        fields: [
          { key: "storyDate", label: "Story Date", type: "date", locked: true },
          {
            key: "storyDuration",
            label: "Duration (minutes)",
            type: "number",
            locked: true,
          },
          {
            key: "storyEndDate",
            label: "Story End Date",
            type: "date",
            locked: true,
          },
        ],
      },
    ],
  };
}

/** Already-migrated built-in schema (unlocked, "Timeline" label). */
function migratedSchema(): MetadataSchema {
  return {
    groups: [
      {
        id: "builtin-document",
        label: "Document",
        fields: [
          { key: "synopsis", label: "Synopsis", type: "text" },
          { key: "notes", label: "Notes", type: "text" },
          { key: "status", label: "Status", type: "select", locked: true },
          {
            key: "pov",
            label: "Point of View",
            type: "resource-ref",
            multiple: false,
          },
        ],
      },
      {
        id: "builtin-story-timeline",
        label: "Timeline",
        fields: [
          { key: "storyDate", label: "Story Date", type: "date" },
          { key: "storyDuration", label: "Duration (minutes)", type: "number" },
          { key: "storyEndDate", label: "Story End Date", type: "date" },
        ],
      },
    ],
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function makeProject(config?: ProjectConfig): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-loadmigr-"));
  const project: Project = {
    id: generateUUID(),
    name: "load-migration-test",
    createdAt: new Date().toISOString(),
    ...(config ? { config } : {}),
  };
  await fs.writeFile(
    path.join(dir, PROJECT_FILENAME),
    JSON.stringify(project, null, 2),
    "utf8",
  );
  return dir;
}

async function writeSidecarFile(
  dir: string,
  id: string,
  data: Record<string, MetadataValue>,
): Promise<void> {
  const metaDir = path.join(dir, "meta");
  await fs.mkdir(metaDir, { recursive: true });
  await fs.writeFile(
    path.join(metaDir, `resource-${id}.meta.json`),
    JSON.stringify(data, null, 2),
    "utf8",
  );
}

async function readConfig(dir: string): Promise<ProjectConfig> {
  const raw = await fs.readFile(path.join(dir, PROJECT_FILENAME), "utf8");
  return (JSON.parse(raw) as Project).config!;
}

async function readProjectRaw(dir: string): Promise<unknown> {
  return JSON.parse(
    await fs.readFile(path.join(dir, PROJECT_FILENAME), "utf8"),
  );
}

async function readSidecarRaw(
  dir: string,
  id: string,
): Promise<Record<string, MetadataValue>> {
  const raw = await fs.readFile(
    path.join(dir, "meta", `resource-${id}.meta.json`),
    "utf8",
  );
  return JSON.parse(raw) as Record<string, MetadataValue>;
}

function findField(schema: MetadataSchema, groupId: string, key: string) {
  return schema.groups
    .find((g) => g.id === groupId)
    ?.fields.find((f) => f.key === key);
}

// ─── schema unlock + group rename ─────────────────────────────────────────────

describe("migrateProjectOnLoad — schema unlock + rename", () => {
  it("strips locked from the six built-in fields", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });
    await migrateProjectOnLoad(dir);
    const schema = (await readConfig(dir)).metadataSchema!;
    for (const key of ["synopsis", "notes", "pov"]) {
      expect(
        findField(schema, "builtin-document", key)?.locked,
      ).toBeUndefined();
    }
    for (const key of ["storyDate", "storyDuration", "storyEndDate"]) {
      expect(
        findField(schema, "builtin-story-timeline", key)?.locked,
      ).toBeUndefined();
    }
  });

  it("leaves the status field locked", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });
    await migrateProjectOnLoad(dir);
    const schema = (await readConfig(dir)).metadataSchema!;
    expect(findField(schema, "builtin-document", "status")?.locked).toBe(true);
  });

  it("renames the builtin-story-timeline group label to Timeline (id unchanged)", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });
    await migrateProjectOnLoad(dir);
    const schema = (await readConfig(dir)).metadataSchema!;
    const group = schema.groups.find((g) => g.id === "builtin-story-timeline");
    expect(group?.label).toBe("Timeline");
    expect(group?.id).toBe("builtin-story-timeline");
  });

  it("does not materialize a default schema for a project without one", async () => {
    const dir = await makeProject({ editorConfig: {} });
    await migrateProjectOnLoad(dir);
    expect((await readConfig(dir)).metadataSchema).toBeUndefined();
  });
});

// ─── value preservation ───────────────────────────────────────────────────────

describe("migrateProjectOnLoad — value preservation", () => {
  it("leaves every sidecar value untouched", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });
    const id = generateUUID();
    await writeSidecarFile(dir, id, {
      id,
      type: "text",
      userMetadata: {
        storyDate: "2024-04-05",
        storyDuration: 4320,
        synopsis: "A duel at dawn.",
        custom: "keep me",
      },
    });

    await migrateProjectOnLoad(dir);

    const sidecar = await readSidecarRaw(dir, id);
    const meta = sidecar.userMetadata as Record<string, MetadataValue>;
    expect(meta.storyDate).toBe("2024-04-05");
    expect(meta.storyDuration).toBe(4320);
    expect(meta.synopsis).toBe("A duel at dawn.");
    expect(meta.custom).toBe("keep me");
  });
});

// ─── feature seeding ──────────────────────────────────────────────────────────

describe("migrateProjectOnLoad — feature seeding", () => {
  it("seeds timeline when any story-timeline value exists", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });
    await writeSidecarFile(dir, generateUUID(), {
      userMetadata: { storyDate: "2024-04-05" },
    });
    await migrateProjectOnLoad(dir);
    expect((await readConfig(dir)).features?.timeline).toBe(true);
  });

  it("seeds pov, synopsis, and notes when their values exist", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });
    await writeSidecarFile(dir, generateUUID(), {
      userMetadata: {
        pov: { id: "r1", name: "Hero" },
        synopsis: "Something happens.",
        notes: "A note.",
      },
    });
    await migrateProjectOnLoad(dir);
    const features = (await readConfig(dir)).features!;
    expect(features.pov).toBe(true);
    expect(features.synopsis).toBe(true);
    expect(features.notes).toBe(true);
  });

  it("only seeds features that actually have data", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });
    await writeSidecarFile(dir, generateUUID(), {
      userMetadata: { storyDate: "2024-04-05" },
    });
    await migrateProjectOnLoad(dir);
    const features = (await readConfig(dir)).features!;
    expect(features.timeline).toBe(true);
    expect(features.pov).toBeUndefined();
    expect(features.synopsis).toBeUndefined();
    expect(features.notes).toBeUndefined();
  });

  it("treats an empty-string value as no data", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });
    await writeSidecarFile(dir, generateUUID(), {
      userMetadata: { notes: "   " },
    });
    await migrateProjectOnLoad(dir);
    expect((await readConfig(dir)).features?.notes).toBeUndefined();
  });

  it("ignores a top-level resource `notes` field (not a metadata value)", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });
    await writeSidecarFile(dir, generateUUID(), {
      notes: "this is the resource-level notes field",
      userMetadata: {},
    });
    await migrateProjectOnLoad(dir);
    expect((await readConfig(dir)).features?.notes).toBeUndefined();
  });

  it("seeds an empty features map for a project with no relevant data", async () => {
    const dir = await makeProject({ editorConfig: {} });
    await writeSidecarFile(dir, generateUUID(), {
      userMetadata: { custom: "value" },
    });
    await migrateProjectOnLoad(dir);
    expect((await readConfig(dir)).features).toEqual({});
  });

  it("seeds features even when no metadata schema is persisted", async () => {
    const dir = await makeProject({ editorConfig: {} });
    await writeSidecarFile(dir, generateUUID(), {
      userMetadata: { pov: { id: "r1", name: "Hero" } },
    });
    await migrateProjectOnLoad(dir);
    const config = await readConfig(dir);
    expect(config.metadataSchema).toBeUndefined();
    expect(config.features?.pov).toBe(true);
  });
});

// ─── idempotency / metadataRevision ───────────────────────────────────────────

describe("migrateProjectOnLoad — idempotency", () => {
  it("makes no further changes on a second load", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });
    await writeSidecarFile(dir, generateUUID(), {
      userMetadata: { storyDate: "2024-04-05" },
    });

    await migrateProjectOnLoad(dir);
    const snapshot1 = await readProjectRaw(dir);

    await migrateProjectOnLoad(dir);
    const snapshot2 = await readProjectRaw(dir);

    expect(snapshot2).toEqual(snapshot1);
  });

  it("bumps metadataRevision exactly once across repeated loads", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });

    await migrateProjectOnLoad(dir);
    const rev1 = (await readConfig(dir)).metadataRevision;

    await migrateProjectOnLoad(dir);
    const rev2 = (await readConfig(dir)).metadataRevision;

    expect(rev1).toBe(1);
    expect(rev2).toBe(1);
  });

  it("does not write or bump metadataRevision when nothing needs migrating", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: migratedSchema(),
      features: {},
      metadataRevision: 5,
    });
    await migrateProjectOnLoad(dir);
    expect((await readConfig(dir)).metadataRevision).toBe(5);
  });
});

// ─── loadProjectFromDisk integration ──────────────────────────────────────────

describe("loadProjectFromDisk runs the load-time migration", () => {
  it("returns a migrated project (unlocked schema, renamed group, seeded features) and preserves resources", async () => {
    const dir = await makeProject({
      editorConfig: {},
      metadataSchema: oldLockedSchema(),
    });
    const id = generateUUID();
    await writeSidecarFile(dir, id, {
      id,
      name: "Scene One",
      type: "text",
      slug: "scene-one",
      orderIndex: 0,
      folderId: null,
      userMetadata: { synopsis: "Opening scene." },
    });
    await fs.mkdir(path.join(dir, "resources", id), { recursive: true });
    await fs.writeFile(
      path.join(dir, "resources", id, "content.txt"),
      "Body text.",
      "utf8",
    );

    const loaded = await loadProjectFromDisk(dir);

    const schema = loaded.project.config!.metadataSchema!;
    expect(
      findField(schema, "builtin-document", "synopsis")?.locked,
    ).toBeUndefined();
    expect(
      schema.groups.find((g) => g.id === "builtin-story-timeline")?.label,
    ).toBe("Timeline");
    expect(loaded.project.config!.features?.synopsis).toBe(true);

    expect(loaded.resources).toHaveLength(1);
    const resource = loaded.resources[0] as unknown as {
      userMetadata?: Record<string, MetadataValue>;
      plaintext: string;
    };
    expect(resource.userMetadata?.synopsis).toBe("Opening scene.");
    expect(resource.plaintext).toBe("Body text.");
  });
});
