import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import {
  updateFieldOptionsWithMigration,
  type OptionsMigrationEntry,
} from "../../src/lib/models/metadata-schema";
import type { MetadataField, MetadataSchema } from "../../src/lib/models/types";

// Feature 110, FR-1 (b): what the options migration does to a Source whose
// multiselect tag holds several options. The stored value after each path is
// recorded in specs/features/folklore-variants/experiments/task-2.md.

const GROUP_ID = "custom-folklore";
const TALE_A = "ATU 510A | Cinderella";
const TALE_B = "ATU 510B | Peau d'Ane";
const TALE_C = "ATU 333 | Little Red Riding Hood";
const SOURCE_ID = "source-1";

const TALE_FIELD: MetadataField = {
  key: "tale-type",
  label: "Tale type",
  type: "multiselect",
  options: [TALE_A, TALE_B, TALE_C],
};

async function makeTaggedProject(tags: string[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-folklore-migr-"));
  const schema: MetadataSchema = {
    groups: [{ id: GROUP_ID, label: "Folklore", fields: [TALE_FIELD] }],
  };
  const proj = createProject({ name: "folklore-migration" });
  await fs.writeFile(
    path.join(dir, PROJECT_FILENAME),
    JSON.stringify(
      { ...proj, config: { ...proj.config, metadataSchema: schema } },
      null,
      2,
    ),
    "utf8",
  );
  await writeSidecar(dir, SOURCE_ID, { userMetadata: { "tale-type": tags } });
  return dir;
}

async function storedTags(dir: string): Promise<unknown> {
  const raw = await fs.readFile(
    path.join(dir, "meta", `resource-${SOURCE_ID}.meta.json`),
    "utf8",
  );
  const sidecar = JSON.parse(raw) as { userMetadata?: Record<string, unknown> };
  return sidecar.userMetadata?.["tale-type"];
}

/** A tag "shows" when its stored string is one of the field's options. */
function shownTags(stored: unknown, options: string[] | undefined): string[] {
  if (!Array.isArray(stored)) return [];
  return (stored as string[]).filter((t) => (options ?? []).includes(t));
}

async function run(
  newOptions: string[],
  migrations: Record<string, OptionsMigrationEntry>,
): Promise<{ stored: unknown; options: string[] | undefined }> {
  const dir = await makeTaggedProject([TALE_A, TALE_B]);
  const schema = await updateFieldOptionsWithMigration(
    dir,
    GROUP_ID,
    "tale-type",
    newOptions,
    migrations,
  );
  return {
    stored: await storedTags(dir),
    options: schema.groups[0].fields[0].options,
  };
}

describe("options migration on a Source tagged with several options", () => {
  it("rename (remove + add, normalize) rewrites the tag and keeps the other", async () => {
    const renamed = "ATU 510A | Cinderella (Perrault)";
    const { stored, options } = await run([renamed, TALE_B, TALE_C], {
      [TALE_A]: { action: "normalize", normalizedTo: renamed },
    });
    expect(stored).toEqual([renamed, TALE_B]);
    expect(shownTags(stored, options)).toEqual([renamed, TALE_B]);
  });

  it("removal with clear drops that tag only; the other still shows", async () => {
    const { stored, options } = await run([TALE_B, TALE_C], {
      [TALE_A]: { action: "clear" },
    });
    expect(stored).toEqual([TALE_B]);
    expect(shownTags(stored, options)).toEqual([TALE_B]);
  });

  it("removal with the default add-to-options keeps value and re-adds the option", async () => {
    const { stored, options } = await run([TALE_B, TALE_C], {
      [TALE_A]: { action: "add-to-options" },
    });
    expect(stored).toEqual([TALE_A, TALE_B]);
    expect(options).toEqual([TALE_B, TALE_C, TALE_A]);
    expect(shownTags(stored, options)).toEqual([TALE_A, TALE_B]);
  });

  it("removal with keep leaves the stored value; the tag is no longer an option", async () => {
    const { stored, options } = await run([TALE_B, TALE_C], {
      [TALE_A]: { action: "keep" },
    });
    expect(stored).toEqual([TALE_A, TALE_B]);
    expect(options).toEqual([TALE_B, TALE_C]);
    expect(shownTags(stored, options)).toEqual([TALE_B]);
  });

  it("removal with no migration entry leaves the stored value unchanged", async () => {
    const { stored, options } = await run([TALE_B, TALE_C], {});
    expect(stored).toEqual([TALE_A, TALE_B]);
    expect(shownTags(stored, options)).toEqual([TALE_B]);
  });

  it("clearing the only tag deletes the stored key", async () => {
    const dir = await makeTaggedProject([TALE_A]);
    await updateFieldOptionsWithMigration(
      dir,
      GROUP_ID,
      "tale-type",
      [TALE_B, TALE_C],
      { [TALE_A]: { action: "clear" } },
    );
    expect(await storedTags(dir)).toBeUndefined();
  });
});
