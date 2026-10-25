/**
 * Experiments E-6 and E-7 (Feature 93, Task 5). NOT part of the suite.
 *
 * Throwaway temp-directory projects (mkdtemp under $TMPDIR). Real cores only:
 * updateEditorConfigCore, setEntityGraphSettingsCore,
 * getEntityGraphSettingsCore. Stored values are read straight from project.json.
 *
 *  E-6 (REPS, default 20 per construction), initial stored editorConfig:
 *      headings {h1:{fontSize:"40px"}}, body {fontSize:"15px"}.
 *   6a overlapping: Promise.all of {headings: H1} and {body: B1} (the two
 *      modal send shapes started together). Counts reps whose stored config
 *      holds both H1 and B1.
 *   6b older copy, modal-shaped: copy C0 loaded; {body: B1} completes; then
 *      {headings: H1} (only the headings key, what HeadingSettingsModal sends).
 *      Counts reps where stored body != B1 (reverted) and stored headings != H1.
 *   6c older copy, whole-copy: as 6b, but the later send carries
 *      {headings: H1, body: C0.body} (not a shape either modal sends).
 *      Counts reps where stored body != B1 and stored headings != H1.
 *  E-7 (REPS), initial: no stored entity-graph keys (effective defaults).
 *   7a older copy: copy S0 read via getEntityGraphSettingsCore; another writer
 *      stores S1 = (["authored","backlinks"], 3); then the panel send built from
 *      S0 (toggle "proximityMentions" on, radius S0's) via setEntityGraphSettingsCore.
 *      Counts reps where stored types != S1 types, stored radius != S1 radius,
 *      either.
 *   7b overlapping: two panel sends from the same S0 started together:
 *      (S0 types + "backlinks", S0 radius) and (S0 types, radius 4).
 *      Counts reps where stored types lack "backlinks", stored radius != 4,
 *      either.
 * Also counts unparseable (project.json fails JSON.parse after) and rejected.
 * Writes result JSON to $E67_RESULT_OUT when set.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "../../../../frontend/src/lib/models/project";
import { PROJECT_FILENAME } from "../../../../frontend/src/lib/models/project-config";
import { updateEditorConfigCore } from "../../../../frontend/src/lib/models/editor-config-core";
import {
  getEntityGraphSettingsCore,
  setEntityGraphSettingsCore,
} from "../../../../frontend/src/lib/models/entity-graph-settings-core";
import { generateUUID } from "../../../../frontend/src/lib/models/uuid";
import { removeDirRetry } from "../../../../frontend/tests/unit/helpers/fs-utils";

const REPS = Number(process.env.E67_REPS ?? 20);
const dirs: string[] = [];
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

afterEach(async () => {
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  for (const dir of dirs.splice(0)) await removeDirRetry(dir);
});

type Bag = Record<string, unknown>;
interface Counts {
  repetitions: number;
  unparseable: number;
  rejected: number;
  tally: Record<string, number>;
}
const newCounts = (): Counts => ({
  repetitions: 0,
  unparseable: 0,
  rejected: 0,
  tally: {},
});
const bump = (c: Counts, k: string) => {
  c.tally[k] = (c.tally[k] ?? 0) + 1;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function newProject(batch: string, name: string, config?: Bag) {
  const projectId = generateUUID();
  const root = path.join(batch, projectId);
  await fs.mkdir(root, { recursive: true });
  const project = createProject({ name }) as unknown as Bag;
  if (config) project.config = { ...((project.config as Bag) ?? {}), ...config };
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(project),
    "utf8",
  );
  return { projectId, root };
}

async function storedConfig(c: Counts, root: string): Promise<Bag | null> {
  try {
    const p = JSON.parse(
      await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8"),
    ) as { config?: Bag };
    return p.config ?? {};
  } catch {
    c.unparseable++;
    return null;
  }
}

const H0 = { h1: { fontSize: "40px" } };
const H1 = { h2: { fontSize: "31px" } };
const B0 = { fontSize: "15px" };
const B1 = { fontSize: "19px" };
const editorOf = (cfg: Bag) => (cfg.editorConfig ?? {}) as Bag;

describe("E-6, E-7 settings saves (before values)", () => {
  it("records counts", async () => {
    const batch = await fs.mkdtemp(path.join(os.tmpdir(), "f93-e67-"));
    dirs.push(batch);
    process.env.GETWRITE_PROJECTS_DIR = batch;
    const seed = { editorConfig: { headings: H0, body: B0 } };

    const e6a = newCounts();
    for (let i = 0; i < REPS; i++) {
      const { projectId, root } = await newProject(batch, `e6a-${i}`, seed);
      e6a.repetitions++;
      try {
        await Promise.all([
          updateEditorConfigCore({ projectId, headings: H1 }),
          updateEditorConfigCore({ projectId, body: B1 }),
        ]);
      } catch {
        e6a.rejected++;
        continue;
      }
      const cfg = await storedConfig(e6a, root);
      if (!cfg) continue;
      const ed = editorOf(cfg);
      if (same(ed.headings, H1) && same(ed.body, B1)) bump(e6a, "holdsBoth");
      if (!same(ed.headings, H1)) bump(e6a, "headingsNotH1");
      if (!same(ed.body, B1)) bump(e6a, "bodyNotB1");
    }

    const e6b = newCounts();
    const e6c = newCounts();
    for (const [c, whole] of [
      [e6b, false],
      [e6c, true],
    ] as const) {
      for (let i = 0; i < REPS; i++) {
        const { projectId, root } = await newProject(batch, `e6bc-${i}`, seed);
        const copy = editorOf((await storedConfig(c, root)) ?? {});
        c.repetitions++;
        try {
          await updateEditorConfigCore({ projectId, body: B1 });
          await updateEditorConfigCore(
            whole
              ? { projectId, headings: H1, body: copy.body as typeof B0 }
              : { projectId, headings: H1 },
          );
        } catch {
          c.rejected++;
          continue;
        }
        const cfg = await storedConfig(c, root);
        if (!cfg) continue;
        const ed = editorOf(cfg);
        if (!same(ed.body, B1)) bump(c, "bodyReverted");
        if (!same(ed.headings, H1)) bump(c, "headingsNotH1");
      }
    }

    const S1 = { types: ["authored", "backlinks"], radius: 3 };
    const e7a = newCounts();
    for (let i = 0; i < REPS; i++) {
      const { projectId, root } = await newProject(batch, `e7a-${i}`);
      e7a.repetitions++;
      try {
        const s0 = await getEntityGraphSettingsCore(projectId);
        await setEntityGraphSettingsCore(projectId, S1.types, S1.radius);
        await setEntityGraphSettingsCore(
          projectId,
          [...s0.entityGraphConnectionTypes, "proximityMentions"],
          s0.entityGraphFocalHopRadius,
        );
      } catch {
        e7a.rejected++;
        continue;
      }
      const cfg = await storedConfig(e7a, root);
      if (!cfg) continue;
      const typesRev = !same(cfg.entityGraphConnectionTypes, S1.types);
      const radRev = cfg.entityGraphFocalHopRadius !== S1.radius;
      if (typesRev) bump(e7a, "typesReverted");
      if (radRev) bump(e7a, "radiusReverted");
      if (typesRev || radRev) bump(e7a, "eitherReverted");
    }

    const e7b = newCounts();
    for (let i = 0; i < REPS; i++) {
      const { projectId, root } = await newProject(batch, `e7b-${i}`);
      e7b.repetitions++;
      try {
        const s0 = await getEntityGraphSettingsCore(projectId);
        await Promise.all([
          setEntityGraphSettingsCore(
            projectId,
            [...s0.entityGraphConnectionTypes, "backlinks"],
            s0.entityGraphFocalHopRadius,
          ),
          setEntityGraphSettingsCore(
            projectId,
            s0.entityGraphConnectionTypes,
            4,
          ),
        ]);
      } catch {
        e7b.rejected++;
        continue;
      }
      const cfg = await storedConfig(e7b, root);
      if (!cfg) continue;
      const types = (cfg.entityGraphConnectionTypes as string[]) ?? [];
      const lost1 = !types.includes("backlinks");
      const lost2 = cfg.entityGraphFocalHopRadius !== 4;
      if (lost1) bump(e7b, "backlinksLost");
      if (lost2) bump(e7b, "radius4Lost");
      if (lost1 || lost2) bump(e7b, "eitherLost");
    }

    const out = JSON.stringify({ batch, reps: REPS, e6a, e6b, e6c, e7a, e7b }, null, 1);
    if (process.env.E67_RESULT_OUT)
      await fs.writeFile(process.env.E67_RESULT_OUT, out, "utf8");
    expect(e6a.repetitions + e7a.repetitions).toBeGreaterThan(0);
  }, 300_000);
});
