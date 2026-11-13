/**
 * Feature 110, Task 21 (FR-20): a narrative and its variants are neutral to
 * the Source rules and the derived indexes. A new Source still starts out of
 * compile and out of the project and daily goals; no narrative, variant or
 * comparison id enters the saved defaults beyond what the existing Source rule
 * seeds; and `rebuildDerivedIndexes` gives the same result with the module on,
 * off and absent.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rebuildDerivedIndexes } from "../../src/lib/models/derived-index-rebuild";
import {
  NARRATIVE_SUBTYPE,
  VARIANT_SUBTYPE,
} from "../../src/lib/models/folklore-types";
import { updateFolderMetadataCore } from "../../src/lib/models/folder-metadata-core";
import { evaluateGoalTotal } from "../../src/lib/models/goal-filtered-total-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { mutateSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import { getWritingLogAggregateCore } from "../../src/lib/models/writing-log-core";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";

const SPEC_PATH = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);
const NARRATIVE_FOLDER_ID = "00000000-0000-4000-8000-0000000000f1";
const TAG = "ATU 510A | Cinderella";

let projectsDir: string;
let projectId: string;
let projectRoot: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-folklore-neutral-"),
  );
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  projectId = generateUUID();
  projectRoot = path.join(projectsDir, projectId);
  await createAndAssertProject(SPEC_PATH, {
    projectRoot,
    name: "Folklore Neutral",
  });
});

afterEach(async () => {
  await flushIndexer();
  if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  await removeDirRetry(projectsDir);
});

async function readProject(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await fs.readFile(path.join(projectRoot, "project.json"), "utf8"),
  ) as Record<string, unknown>;
}

async function writeConfig(config: Record<string, unknown>): Promise<void> {
  const project = await readProject();
  project.config = config;
  await fs.writeFile(
    path.join(projectRoot, "project.json"),
    JSON.stringify(project),
  );
}

async function readConfig(): Promise<Record<string, unknown>> {
  return ((await readProject()).config ?? {}) as Record<string, unknown>;
}

async function patchConfig(patch: Record<string, unknown>): Promise<void> {
  await writeConfig({ ...(await readConfig()), ...patch });
}

async function createNarrativeFolder(): Promise<void> {
  const dir = path.join(projectRoot, "folders", "narrative");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "folder.json"),
    JSON.stringify({
      id: NARRATIVE_FOLDER_ID,
      slug: "narrative",
      name: "Cinderella",
      type: "folder",
      orderIndex: 99,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
  );
  await patchConfig({ subtypes: [NARRATIVE_SUBTYPE, VARIANT_SUBTYPE] });
  await updateFolderMetadataCore(projectId, NARRATIVE_FOLDER_ID, {
    resourceSubtype: NARRATIVE_SUBTYPE,
  });
}

/** Marks a Source as a Variant with a motif tag, as the sidebar would. */
async function makeVariant(id: string, tag: string): Promise<void> {
  await mutateSidecar(projectRoot, id, (current) => ({
    ...(current ?? {}),
    folderId: NARRATIVE_FOLDER_ID,
    resourceSubtype: VARIANT_SUBTYPE,
    userMetadata: { motifs: [tag] },
  }));
}

async function createSource(name: string, text: string): Promise<string> {
  const created = await createResourceCore(projectId, {
    type: "source",
    name,
    text: { plainText: text },
  });
  return created.id;
}

function excludedIds(config: Record<string, unknown>): string[] {
  return (config.compileDefaults as { excludedResourceIds: string[] })
    .excludedResourceIds;
}

const NOW = new Date();
const DAY_START = new Date(
  Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()),
);
const FROM = DAY_START.toISOString();
const TO = new Date(DAY_START.getTime() + 86_400_000).toISOString();

describe("a new Source under a narrative (Feature 110 FR-20)", () => {
  it("starts out of compile, with exportDefaults untouched, as a plain Source does", async () => {
    await createNarrativeFolder();
    const plain = await createSource("Plain Source", "one two three");
    const afterPlain = await readConfig();
    const variant = await createSource("Variant A", "four five six");
    await makeVariant(variant, TAG);
    const config = await readConfig();
    expect(excludedIds(afterPlain)).toEqual([plain]);
    expect(excludedIds(config)).toEqual([plain, variant]);
    expect(config.exportDefaults).toBeUndefined();
  });

  it("puts no narrative folder id and no tag text in either saved default", async () => {
    await createNarrativeFolder();
    const variant = await createSource("Variant A", "four five six");
    await makeVariant(variant, TAG);
    const config = await readConfig();
    const saved = JSON.stringify({
      compile: config.compileDefaults,
      export: config.exportDefaults ?? null,
    });
    expect(saved).not.toContain(NARRATIVE_FOLDER_ID);
    expect(saved).not.toContain("ATU 510A");
  });

  it("leaves the project total and the daily figure as they were", async () => {
    await createNarrativeFolder();
    const totalBefore = await evaluateGoalTotal(projectRoot, NOW);
    const dailyBefore = await getWritingLogAggregateCore(projectId, FROM, TO);
    const variant = await createSource("Variant A", "four five six seven");
    await makeVariant(variant, TAG);
    await flushIndexer();
    expect(await evaluateGoalTotal(projectRoot, NOW)).toEqual(totalBefore);
    expect(await getWritingLogAggregateCore(projectId, FROM, TO)).toEqual(
      dailyBefore,
    );
  });
});

/** Every derived-index file under `meta/`, name to parsed content. */
async function snapshotIndexes(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const indexDir = path.join(projectRoot, "meta", "index");
  for (const name of (await fs.readdir(indexDir)).sort()) {
    out[`index/${name}`] = JSON.parse(
      await fs.readFile(path.join(indexDir, name), "utf8"),
    );
  }
  out["backlinks"] = JSON.parse(
    await fs.readFile(path.join(projectRoot, "meta", "backlinks.json"), "utf8"),
  );
  return out;
}

describe("rebuildDerivedIndexes with the Narratives module on and off (Feature 110 FR-20)", () => {
  it("gives the same indexes and result with the module off, on and absent", async () => {
    await createNarrativeFolder();
    const a = await createSource("Variant A", "the glass slipper fits");
    const b = await createSource("Variant B", "a golden slipper and a pumpkin");
    await makeVariant(a, TAG);
    await makeVariant(b, TAG);
    await flushIndexer();

    await patchConfig({ modules: { folklore: false } });
    const offResult = await rebuildDerivedIndexes(projectRoot);
    const off = await snapshotIndexes();

    await patchConfig({ modules: { folklore: true } });
    const onResult = await rebuildDerivedIndexes(projectRoot);
    const on = await snapshotIndexes();

    const { modules: _modules, ...withoutModules } = await readConfig();
    void _modules;
    await writeConfig(withoutModules);
    const absentResult = await rebuildDerivedIndexes(projectRoot);
    const absent = await snapshotIndexes();

    expect(Object.keys(off).length).toBeGreaterThan(1);
    expect(on).toEqual(off);
    expect(absent).toEqual(off);
    expect(onResult).toEqual(offResult);
    expect(absentResult).toEqual(offResult);
  });
});
