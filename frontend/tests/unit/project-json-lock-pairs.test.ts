/**
 * Feature 92 FR-11 (Task 22): every pair of `project.json` writer families
 * that can now overlap must keep both writers' changes, and the file must
 * parse. Families: A = `updateEditorConfigCore`, B = `setWordCountGoalCore`,
 * C = `addField` (metadata-schema), D = `updateFeatureConfig`, E = the
 * `metadataRevision` bump inside `writeSidecar`, driven through
 * `updateSidecarCore`. A with C is covered by metadata-concurrent-writes.test.ts.
 *
 * Two tests per pair:
 * - a race: both writers started at once, 20 repetitions, fresh project each.
 *   Timing-based, so a pass alone does not show that the writers are on the lock.
 * - a gate: the test holds the `project.json` file lock itself, starts both
 *   writers, and asserts neither has changed the file while the lock is held;
 *   after the release, both changes are present. A writer that is not on the
 *   per-file lock writes during the hold and fails this deterministically.
 *
 * The `metadataRevision` rule (E with C, E with B, E with D): the final value
 * is the start value plus one per writer that bumps (C and E bump once per
 * write; A, B and D never do).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withFileLock } from "../../src/lib/models/file-lock";
import { updateEditorConfigCore } from "../../src/lib/models/editor-config-core";
import { setWordCountGoalCore } from "../../src/lib/models/word-count-goal-core";
import { updateFeatureConfig } from "../../src/lib/models/project-features";
import { addField, addGroup } from "../../src/lib/models/metadata-schema";
import { updateSidecarCore } from "../../src/lib/models/resource-crud-core";
import { createResourceOfType } from "../../src/lib/models/resource-factory";
import { writeResourceWithInitialRevision } from "../../src/lib/models/resource-initial-revision";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";

const REPS = 20;
const GATE_REPS = 3;
const GATE_WAIT_MS = 50;

const dirs: string[] = [];
const originalEnv = process.env.GETWRITE_PROJECTS_DIR;

afterEach(async () => {
  await flushIndexer();
  if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  for (const dir of dirs.splice(0)) await removeDirRetry(dir);
});

type FamilyId = "A" | "B" | "C" | "D" | "E";

interface Fixture {
  projectId: string;
  projectRoot: string;
  resourceId: string;
}

interface StoredProject {
  config?: {
    metadataRevision?: number;
    wordCountGoal?: number;
    subtypes?: string[];
    editorConfig?: { body?: { fontSize?: string } };
    metadataSchema?: { groups?: { fields?: { key?: string }[] }[] };
  };
}

interface Family {
  /** True when one write of this family adds 1 to `metadataRevision`. */
  bumps: boolean;
  run: (fx: Fixture) => Promise<unknown>;
  /** Returns a failure label when this writer's change is missing. */
  lost: (project: StoredProject) => string | null;
}

const FAMILIES: Record<FamilyId, Family> = {
  A: {
    bumps: false,
    run: (fx) =>
      updateEditorConfigCore({
        projectId: fx.projectId,
        body: { fontSize: "19px" },
      }),
    lost: (p) =>
      p.config?.editorConfig?.body?.fontSize === "19px" ? null : "A:fontSize",
  },
  B: {
    bumps: false,
    run: (fx) => setWordCountGoalCore(fx.projectId, 4321),
    lost: (p) => (p.config?.wordCountGoal === 4321 ? null : "B:wordCountGoal"),
  },
  C: {
    bumps: true,
    run: (fx) =>
      addField(fx.projectRoot, "custom-group", {
        key: "mood",
        label: "Mood",
        type: "text",
      }),
    lost: (p) =>
      (p.config?.metadataSchema?.groups ?? []).some((g) =>
        (g.fields ?? []).some((f) => f.key === "mood"),
      )
        ? null
        : "C:mood",
  },
  D: {
    bumps: false,
    run: (fx) => updateFeatureConfig(fx.projectRoot, { subtypes: ["Scene"] }),
    lost: (p) =>
      p.config?.subtypes?.join(",") === "Scene" ? null : "D:subtypes",
  },
  E: {
    bumps: true,
    run: (fx) =>
      updateSidecarCore(fx.projectId, fx.resourceId, { marker: "after" }),
    lost: () => null,
  },
};

/** The seven pairs of Task 22 (A with C is Task 15). */
const PAIRS: readonly [FamilyId, FamilyId][] = [
  ["D", "B"],
  ["D", "A"],
  ["D", "C"],
  ["E", "C"],
  ["E", "B"],
  ["E", "D"],
  ["B", "C"],
];

async function newFixture(): Promise<Fixture> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-json-pairs-"),
  );
  dirs.push(projectsDir);
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  const projectId = generateUUID();
  const projectRoot = path.join(projectsDir, projectId);
  await createAndAssertProject(
    {
      id: "json-pairs",
      name: "Json Pairs",
      folders: [{ name: "Workspace", special: true }],
    },
    { projectRoot, name: "Json Pairs" },
  );
  await addGroup(projectRoot, {
    id: "custom-group",
    label: "Custom",
    fields: [],
  });
  const resource = createResourceOfType("text", {
    name: "Scene",
    type: "text",
    text: { plainText: "one two three" },
  });
  await writeResourceWithInitialRevision(projectRoot, resource);
  await flushIndexer();
  return { projectId, projectRoot, resourceId: resource.id };
}

const projectJsonPath = (fx: Fixture): string =>
  path.join(fx.projectRoot, "project.json");

async function readRaw(fx: Fixture): Promise<string> {
  return fs.readFile(projectJsonPath(fx), "utf8");
}

function startRevision(raw: string): number {
  return (JSON.parse(raw) as StoredProject).config?.metadataRevision ?? 0;
}

/** Failure labels for the pair given the file as stored after both writes. */
function verify(
  pair: readonly [FamilyId, FamilyId],
  raw: string,
  startRev: number,
): string[] {
  let project: StoredProject;
  try {
    project = JSON.parse(raw) as StoredProject;
  } catch {
    return ["unparseable"];
  }
  const failures: string[] = [];
  for (const id of pair) {
    const label = FAMILIES[id].lost(project);
    if (label !== null) failures.push(label);
  }
  const expected = startRev + pair.filter((id) => FAMILIES[id].bumps).length;
  const actual = project.config?.metadataRevision ?? 0;
  if (actual !== expected) {
    failures.push(`metadataRevision:${actual}!=${expected}`);
  }
  return failures;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe.each(PAIRS)("project.json writers %s with %s", (first, second) => {
  const pair = [first, second] as const;

  it("keep both changes when started at once (20 repetitions)", async () => {
    const failures: string[] = [];
    for (let rep = 0; rep < REPS; rep += 1) {
      const fx = await newFixture();
      const startRev = startRevision(await readRaw(fx));
      const settled = await Promise.allSettled([
        FAMILIES[first].run(fx),
        FAMILIES[second].run(fx),
      ]);
      settled.forEach((s, i) => {
        if (s.status === "rejected")
          failures.push(`${rep}:rejected:${pair[i]}`);
      });
      for (const label of verify(pair, await readRaw(fx), startRev)) {
        failures.push(`${rep}:${label}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120000);

  it("neither writes while the project.json lock is held, both after it", async () => {
    const failures: string[] = [];
    for (let rep = 0; rep < GATE_REPS; rep += 1) {
      const fx = await newFixture();
      const before = await readRaw(fx);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const held = withFileLock(projectJsonPath(fx), () => gate);
      const writers = Promise.allSettled([
        FAMILIES[first].run(fx),
        FAMILIES[second].run(fx),
      ]);
      await sleep(GATE_WAIT_MS);
      if ((await readRaw(fx)) !== before) failures.push(`${rep}:wrote-in-hold`);
      release();
      await held;
      const settled = await writers;
      settled.forEach((s, i) => {
        if (s.status === "rejected")
          failures.push(`${rep}:rejected:${pair[i]}`);
      });
      for (const label of verify(
        pair,
        await readRaw(fx),
        startRevision(before),
      )) {
        failures.push(`${rep}:${label}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120000);
});
