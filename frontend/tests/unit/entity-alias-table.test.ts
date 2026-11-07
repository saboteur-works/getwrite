import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter, mkdir, writeFile } from "../../src/lib/models/io";
import { buildEntityAliasTable } from "../../src/lib/models/entity-alias-table";

async function makeProject(): Promise<string> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-eat-"));
  await mkdir(path.join(projectRoot, "resources"), { recursive: true });
  await mkdir(path.join(projectRoot, "meta"), { recursive: true });
  return projectRoot;
}

async function addResource(
  projectRoot: string,
  resourceId: string,
): Promise<void> {
  await mkdir(path.join(projectRoot, "resources", resourceId), {
    recursive: true,
  });
}

async function writeEntitySidecar(
  projectRoot: string,
  resourceId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const filePath = path.join(
    projectRoot,
    "meta",
    `resource-${resourceId}.meta.json`,
  );
  await writeFile(filePath, JSON.stringify(fields, null, 2), "utf8");
}

describe("buildEntityAliasTable (Task 3)", () => {
  beforeEach(() => {
    const mem = createMemoryAdapter();
    setStorageAdapter(mem);
  });

  it("includes a single entity with unique aliases and reports no ambiguity", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "entity-aria");
    await writeEntitySidecar(projectRoot, "entity-aria", {
      name: "Aria",
      entityKind: "character",
      aliases: ["Ari", "The Wanderer"],
    });

    const table = await buildEntityAliasTable(projectRoot);

    expect(table.entities["entity-aria"]).toEqual({
      entityId: "entity-aria",
      entityKind: "character",
      name: "Aria",
      aliases: ["Ari", "The Wanderer"],
      terms: ["Aria", "Ari", "The Wanderer"],
      dismissedNoiseTerms: [],
    });

    // No term of this entity should appear as ambiguous (claimed by >1 entity).
    for (const term of table.entities["entity-aria"].terms) {
      const normalized = term.trim().toLowerCase();
      expect(table.claimedBy[normalized]).toBeUndefined();
    }
  });

  it("flags two entities that share one alias, listing both as claimants", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "entity-aria");
    await writeEntitySidecar(projectRoot, "entity-aria", {
      name: "Aria",
      entityKind: "character",
      aliases: ["The Wanderer"],
    });

    await addResource(projectRoot, "entity-jones");
    await writeEntitySidecar(projectRoot, "entity-jones", {
      name: "Jones",
      entityKind: "character",
      // Shares a case-variant of "the wanderer" with entity-aria.
      aliases: ["The WANDERER"],
    });

    const table = await buildEntityAliasTable(projectRoot);

    expect(table.claimedBy["the wanderer"]).toBeDefined();
    expect(new Set(table.claimedBy["the wanderer"])).toEqual(
      new Set(["entity-aria", "entity-jones"]),
    );

    // Non-shared terms remain unambiguous.
    expect(table.claimedBy["aria"]).toBeUndefined();
    expect(table.claimedBy["jones"]).toBeUndefined();
  });

  it("includes an entity with no aliases, matching on name only", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "entity-solo");
    await writeEntitySidecar(projectRoot, "entity-solo", {
      name: "Solo",
      entityKind: "character",
    });

    const table = await buildEntityAliasTable(projectRoot);

    expect(table.entities["entity-solo"]).toEqual({
      entityId: "entity-solo",
      entityKind: "character",
      name: "Solo",
      aliases: [],
      terms: ["Solo"],
      dismissedNoiseTerms: [],
    });
    expect(table.claimedBy["solo"]).toBeUndefined();
  });

  it("reads dismissedNoiseTerms from the sidecar, defensively filtered to strings, defaulting to [] (post-implementation bug fix)", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "entity-dismisser");
    await writeEntitySidecar(projectRoot, "entity-dismisser", {
      name: "Meridian",
      entityKind: "character",
      dismissedNoiseTerms: ["meridian", 42, null, "may"],
    });

    await addResource(projectRoot, "entity-no-dismissals");
    await writeEntitySidecar(projectRoot, "entity-no-dismissals", {
      name: "Solo",
      entityKind: "character",
    });

    const table = await buildEntityAliasTable(projectRoot);

    expect(table.entities["entity-dismisser"].dismissedNoiseTerms).toEqual([
      "meridian",
      "may",
    ]);
    expect(table.entities["entity-no-dismissals"].dismissedNoiseTerms).toEqual(
      [],
    );
  });

  it("excludes resources without entityKind set", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "plain-resource");
    await writeEntitySidecar(projectRoot, "plain-resource", {
      name: "Not An Entity",
    });

    const table = await buildEntityAliasTable(projectRoot);

    expect(table.entities["plain-resource"]).toBeUndefined();
    expect(Object.keys(table.entities)).toHaveLength(0);
    expect(Object.keys(table.claimedBy)).toHaveLength(0);
  });
});

describe("buildEntityAliasTable (Feature 102 FR-21, Sources)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  it("includes a Source whose sidecar holds entityKind like any entity (owner decision, 2026-11-07)", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "src-1");
    await addResource(projectRoot, "src-plain");
    await writeEntitySidecar(projectRoot, "src-1", {
      name: "Aria",
      type: "source",
      entityKind: "character",
      aliases: ["Ari"],
    });
    await writeEntitySidecar(projectRoot, "src-plain", {
      name: "Interview",
      type: "source",
    });

    const table = await buildEntityAliasTable(projectRoot);

    expect(Object.keys(table.entities)).toEqual(["src-1"]);
    expect(table.entities["src-1"]).toEqual({
      entityId: "src-1",
      entityKind: "character",
      name: "Aria",
      aliases: ["Ari"],
      terms: ["Aria", "Ari"],
      dismissedNoiseTerms: [],
    });
  });

  it("treats a Source with entityKind as a claimant of a shared name, like a text entity", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "src-1");
    await addResource(projectRoot, "entity-aria");
    await writeEntitySidecar(projectRoot, "src-1", {
      name: "Aria",
      type: "source",
      entityKind: "character",
    });
    await writeEntitySidecar(projectRoot, "entity-aria", {
      name: "Aria",
      type: "text",
      entityKind: "character",
    });

    const table = await buildEntityAliasTable(projectRoot);

    expect(table.claimedBy["aria"]?.slice().sort()).toEqual([
      "entity-aria",
      "src-1",
    ]);
  });

  it("does not put a Source with no entityKind in the table", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "src-2");
    await writeEntitySidecar(projectRoot, "src-2", {
      name: "Interview",
      type: "source",
    });
    expect((await buildEntityAliasTable(projectRoot)).entities).toEqual({});
  });
});
