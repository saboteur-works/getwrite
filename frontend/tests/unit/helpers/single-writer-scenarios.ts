/**
 * Feature 92, Task 25: one scripted single-writer scenario per writer family
 * (A to E for `project.json`, S1 to S4 for sidecars), each run on an
 * otherwise idle temp project with a frozen clock. A run produces a
 * {@link ScenarioSnapshot}: the bytes of `project.json` and of the resource's
 * sidecar afterwards, the writer's return value and the error it raised.
 *
 * The scenarios use only the public API that existed before the lock change
 * (no `mutateSidecar`, no `withFileLock`), so the same file runs against the
 * unchanged tree to capture the fixture
 * `tests/fixtures/project-json-lock/single-writer-baseline.json`, and against
 * the current tree to compare with it. The caller freezes `Date` (see
 * {@link FROZEN_NOW}).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { updateEditorConfigCore } from "../../../src/lib/models/editor-config-core";
import { setWordCountGoalCore } from "../../../src/lib/models/word-count-goal-core";
import { updateFeatureConfig } from "../../../src/lib/models/project-features";
import {
  addField,
  addGroup,
  clearField,
} from "../../../src/lib/models/metadata-schema";
import {
  renameResourceSidecarCore,
  reorderResourcesCore,
  setNoiseTermDismissedCore,
  updateSidecarCore,
} from "../../../src/lib/models/resource-crud-core";
import { updateRevisionInPlace } from "../../../src/lib/models/revision-core";
import { createResourceOfType } from "../../../src/lib/models/resource-factory";
import { writeResourceWithInitialRevision } from "../../../src/lib/models/resource-initial-revision";
import {
  sidecarPathForProject,
  writeSidecar,
} from "../../../src/lib/models/sidecar";
import { flushIndexer } from "../../../src/lib/models/indexer-queue";
import { removeDirRetry } from "./fs-utils";

export const FROZEN_NOW = "2026-01-02T03:04:05.000Z";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "33333333-3333-4333-8333-333333333333";

export interface ScenarioSnapshot {
  /** `project.json` as stored afterwards, or "<absent>". */
  projectJson: string;
  /** The resource sidecar as stored afterwards, or "<absent>". */
  sidecar: string;
  /** `JSON.stringify` of the return value, "<undefined>" for undefined. */
  returned: string;
  /** Revision `v-1` metadata and content as stored, "" when there is none. */
  revision: string;
  /** Error name, code and message, or null. */
  error: { name: string; code: string | null; message: string } | null;
}

interface Ctx {
  projectsDir: string;
  projectRoot: string;
  sidecarPath: string;
}

type Corruption =
  | "none"
  | "project-json-unparseable"
  | "project-json-absent"
  | "sidecar-unparseable";

interface Scenario {
  family: string;
  corruption: Corruption;
  /** Whether setup also creates a text resource with a canonical revision. */
  withResource?: boolean;
  /** Whether setup adds a schema group `custom-group` (and a field `mood`). */
  withSchema?: boolean;
  run: (ctx: Ctx) => Promise<unknown>;
}

const SIDECAR = {
  id: RESOURCE_ID,
  name: "Scene",
  type: "text",
  slug: "scene",
  orderIndex: 1,
  folderId: null,
  createdAt: "2025-12-01T00:00:00.000Z",
  updatedAt: "2025-12-01T00:00:00.000Z",
  userMetadata: { mood: "calm", keep: "yes" },
};

const FIELD = { key: "mood", label: "Mood", type: "text" } as const;

export const SCENARIOS: Record<string, Scenario> = {
  "A editor config": {
    family: "A",
    corruption: "none",
    run: () =>
      updateEditorConfigCore({
        projectId: PROJECT_ID,
        body: { fontSize: "19px" },
      }),
  },
  "A editor config, unparseable project.json": {
    family: "A",
    corruption: "project-json-unparseable",
    run: () =>
      updateEditorConfigCore({
        projectId: PROJECT_ID,
        body: { fontSize: "19px" },
      }),
  },
  "B word-count goal": {
    family: "B",
    corruption: "none",
    run: () => setWordCountGoalCore(PROJECT_ID, 4321),
  },
  "B word-count goal, unparseable project.json": {
    family: "B",
    corruption: "project-json-unparseable",
    run: () => setWordCountGoalCore(PROJECT_ID, 4321),
  },
  "C addField": {
    family: "C",
    corruption: "none",
    withSchema: true,
    run: (ctx) =>
      addField(ctx.projectRoot, "custom-group", { ...FIELD, key: "tone" }),
  },
  "C addField, unparseable project.json": {
    family: "C",
    corruption: "project-json-unparseable",
    run: (ctx) =>
      addField(ctx.projectRoot, "custom-group", { ...FIELD, key: "tone" }),
  },
  "D feature config": {
    family: "D",
    corruption: "none",
    run: (ctx) => updateFeatureConfig(ctx.projectRoot, { subtypes: ["Scene"] }),
  },
  "D feature config, unparseable project.json": {
    family: "D",
    corruption: "project-json-unparseable",
    run: (ctx) => updateFeatureConfig(ctx.projectRoot, { subtypes: ["Scene"] }),
  },
  "E revision bump through updateSidecarCore": {
    family: "E",
    corruption: "none",
    run: () => updateSidecarCore(PROJECT_ID, RESOURCE_ID, { marker: "after" }),
  },
  "E revision bump, project.json absent": {
    family: "E",
    corruption: "project-json-absent",
    run: () => updateSidecarCore(PROJECT_ID, RESOURCE_ID, { marker: "after" }),
  },
  "E revision bump, unparseable project.json": {
    family: "E",
    corruption: "project-json-unparseable",
    run: () => updateSidecarCore(PROJECT_ID, RESOURCE_ID, { marker: "after" }),
  },
  "S1 updateSidecarCore": {
    family: "S1",
    corruption: "none",
    run: () =>
      updateSidecarCore(
        PROJECT_ID,
        RESOURCE_ID,
        { name: "Renamed", extra: 1 },
        ["resourceSubtype"],
      ),
  },
  "S1 updateSidecarCore, unparseable sidecar": {
    family: "S1",
    corruption: "sidecar-unparseable",
    run: () => updateSidecarCore(PROJECT_ID, RESOURCE_ID, { name: "Renamed" }),
  },
  "S2 updateRevisionInPlace": {
    family: "S2",
    corruption: "none",
    withResource: true,
    run: (ctx) =>
      updateRevisionInPlace(
        ctx.projectRoot,
        RESOURCE_ID,
        REVISION_ID,
        "one two three four",
      ),
  },
  "S2 updateRevisionInPlace, unparseable sidecar": {
    family: "S2",
    corruption: "sidecar-unparseable",
    withResource: true,
    run: (ctx) =>
      updateRevisionInPlace(
        ctx.projectRoot,
        RESOURCE_ID,
        REVISION_ID,
        "one two three four",
      ),
  },
  "S3 clearField sweep": {
    family: "S3",
    corruption: "none",
    withSchema: true,
    run: (ctx) => clearField(ctx.projectRoot, "custom-group", "mood"),
  },
  "S3 clearField sweep, unparseable sidecar": {
    family: "S3",
    corruption: "sidecar-unparseable",
    withSchema: true,
    run: (ctx) => clearField(ctx.projectRoot, "custom-group", "mood"),
  },
  "S4 setNoiseTermDismissedCore": {
    family: "S4",
    corruption: "none",
    run: () => setNoiseTermDismissedCore(PROJECT_ID, RESOURCE_ID, "Term", true),
  },
  "S4 setNoiseTermDismissedCore, unparseable sidecar": {
    family: "S4",
    corruption: "sidecar-unparseable",
    run: () => setNoiseTermDismissedCore(PROJECT_ID, RESOURCE_ID, "Term", true),
  },
  "S4 renameResourceSidecarCore": {
    family: "S4",
    corruption: "none",
    run: () => renameResourceSidecarCore(PROJECT_ID, RESOURCE_ID, "New name"),
  },
  "S4 reorderResourcesCore": {
    family: "S4",
    corruption: "none",
    run: (ctx) =>
      reorderResourcesCore(PROJECT_ID, {
        folderOrder: [],
        resourceOrder: [{ id: RESOURCE_ID, orderIndex: 4, folderId: null }],
      }),
  },
};

const BASE_PROJECT = {
  id: PROJECT_ID,
  name: "Idle project",
  createdAt: "2025-12-01T00:00:00.000Z",
  updatedAt: "2025-12-01T00:00:00.000Z",
  folders: [],
  resources: [],
  config: {
    metadataRevision: 3,
    editorConfig: { body: { fontFamily: "serif" } },
  },
};

async function setUp(scenario: Scenario): Promise<Ctx> {
  const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-single-"));
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  const projectRoot = path.join(projectsDir, PROJECT_ID);
  await fs.mkdir(path.join(projectRoot, "meta"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "project.json"),
    JSON.stringify(BASE_PROJECT, null, 2),
    "utf8",
  );
  const ctx: Ctx = {
    projectsDir,
    projectRoot,
    sidecarPath: sidecarPathForProject(projectRoot, RESOURCE_ID),
  };
  if (scenario.withSchema) {
    await addGroup(projectRoot, {
      id: "custom-group",
      label: "Custom",
      fields: [],
    });
    await addField(projectRoot, "custom-group", { ...FIELD });
  }
  if (scenario.withResource) {
    const resource = createResourceOfType("text", {
      name: "Scene",
      type: "text",
      text: { plainText: "one two three" },
    });
    await writeResourceWithInitialRevision(projectRoot, {
      ...resource,
      id: RESOURCE_ID,
    } as typeof resource);
    // The revision id is generated; fix it so a returned revision is stable.
    const metaFile = path.join(
      projectRoot,
      "revisions",
      RESOURCE_ID,
      "v-1",
      "metadata.json",
    );
    const meta = JSON.parse(await fs.readFile(metaFile, "utf8"));
    await fs.writeFile(
      metaFile,
      JSON.stringify({ ...meta, id: REVISION_ID }, null, 2),
      "utf8",
    );
    // Keep the user metadata the sweep scenarios look for.
    await writeSidecar(projectRoot, RESOURCE_ID, {
      ...JSON.parse(await fs.readFile(ctx.sidecarPath, "utf8")),
      userMetadata: SIDECAR.userMetadata,
    });
  } else {
    await writeSidecar(projectRoot, RESOURCE_ID, { ...SIDECAR });
  }
  await flushIndexer();
  if (scenario.corruption === "project-json-unparseable") {
    await fs.writeFile(
      path.join(projectRoot, "project.json"),
      "{not json",
      "utf8",
    );
  } else if (scenario.corruption === "project-json-absent") {
    await fs.rm(path.join(projectRoot, "project.json"));
  } else if (scenario.corruption === "sidecar-unparseable") {
    await fs.writeFile(ctx.sidecarPath, "{not json", "utf8");
  }
  return ctx;
}

async function readOrAbsent(file: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "<absent>";
  }
}

/** Runs one scenario on a fresh temp project and returns its snapshot. */
export async function runScenario(name: string): Promise<ScenarioSnapshot> {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`unknown scenario ${name}`);
  const ctx = await setUp(scenario);
  const scrub = (text: string): string =>
    text.split(ctx.projectsDir).join("<ROOT>");
  try {
    let returned = "<undefined>";
    let error: ScenarioSnapshot["error"] = null;
    try {
      const value = await scenario.run(ctx);
      returned =
        value === undefined ? "<undefined>" : JSON.stringify(value, null, 2);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      error = { name: e.name, code: e.code ?? null, message: scrub(e.message) };
    }
    await flushIndexer();
    const revisionDir = path.join(
      ctx.projectRoot,
      "revisions",
      RESOURCE_ID,
      "v-1",
    );
    const revision = scenario.withResource
      ? (await readOrAbsent(path.join(revisionDir, "metadata.json"))) +
        "\n---\n" +
        (await readOrAbsent(path.join(revisionDir, "content.bin")))
      : "";
    return {
      revision: scrub(revision),
      projectJson: scrub(
        await readOrAbsent(path.join(ctx.projectRoot, "project.json")),
      ),
      sidecar: scrub(await readOrAbsent(ctx.sidecarPath)),
      returned: scrub(returned),
      error,
    };
  } finally {
    await removeDirRetry(ctx.projectsDir);
  }
}
