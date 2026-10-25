/**
 * Experiments E-1, E-2, E-3 (Feature 93, Task 3). NOT part of the suite.
 *
 * Throwaway temp-directory projects (mkdtemp under $TMPDIR). Real cores only.
 * Every repetition: a fresh project and a text resource; the "client copy" is
 * the object loadProjectCore returns for it (what the page holds). Each stale
 * send is the page-save construction (page.tsx applyUpdate): the client copy
 * with a userMetadata edit and wordCount overlaid from the stored value, sent
 * through updateSidecarCore.
 *
 *  E-1 (REPS_E1): client copy loaded; renameResourceSidecarCore; stale send.
 *      Counts repetitions whose stored `name` equals the pre-rename client value.
 *  E-2 (REPS_E2): one canonical save and a 5 ms pause, client copy loaded
 *      (carries updatedAt U0); a second canonical save (stored updatedAt U1);
 *      stale send. Counts repetitions where the second save advanced
 *      updatedAt, and where the stored updatedAt after the send equals U0.
 *  E-3 (REPS_E3): "alpha" dismissed; client copy loaded (["alpha"]);
 *      setNoiseTermDismissedCore("hello"); stale send. Counts repetitions whose
 *      stored list lacks "hello" after the send.
 * Per repetition also counts: unparseable (sidecar file does not JSON.parse
 * after the send) and rejected (a core call threw).
 * Writes the result JSON to $E123_RESULT_OUT when set.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "../../../../frontend/src/lib/models/project";
import { PROJECT_FILENAME } from "../../../../frontend/src/lib/models/project-config";
import {
  createResourceCore,
  renameResourceSidecarCore,
  setNoiseTermDismissedCore,
  updateSidecarCore,
} from "../../../../frontend/src/lib/models/resource-crud-core";
import { loadProjectCore } from "../../../../frontend/src/lib/models/project-crud-core";
import { readSidecar } from "../../../../frontend/src/lib/models/sidecar";
import { listRevisions } from "../../../../frontend/src/lib/models/revision";
import { updateRevisionInPlace } from "../../../../frontend/src/lib/models/revision-core";
import { flushIndexer } from "../../../../frontend/src/lib/models/indexer-queue";
import { generateUUID } from "../../../../frontend/src/lib/models/uuid";
import { removeDirRetry } from "../../../../frontend/tests/unit/helpers/fs-utils";

const REPS_E1 = Number(process.env.E123_REPS_E1 ?? 20);
const REPS_E2 = Number(process.env.E123_REPS_E2 ?? 100);
const REPS_E3 = Number(process.env.E123_REPS_E3 ?? 20);
const dirs: string[] = [];
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

afterEach(async () => {
  await flushIndexer();
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  for (const dir of dirs.splice(0)) await removeDirRetry(dir);
});

const doc = (text: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
type Bag = Record<string, unknown>;
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

interface Counts {
  repetitions: number;
  lostOrStale: number;
  unparseable: number;
  rejected: number;
  extra: Record<string, number>;
}
const newCounts = (): Counts => ({
  repetitions: 0,
  lostOrStale: 0,
  unparseable: 0,
  rejected: 0,
  extra: {},
});
const bump = (c: Counts, k: string) => {
  c.extra[k] = (c.extra[k] ?? 0) + 1;
};

async function setup(batch: string, name: string) {
  const projectId = generateUUID();
  const projectRoot = path.join(batch, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(createProject({ name })),
    "utf8",
  );
  const created = await createResourceCore(projectId, {
    name: "Chapter One",
    type: "text",
    text: { plainText: "hello world", tiptap: doc("hello world") },
  });
  return { projectId, projectRoot, id: created.id };
}

async function canonicalSave(root: string, id: string, text: string) {
  const [rev] = await listRevisions(root, id);
  await updateRevisionInPlace(root, id, rev!.id, JSON.stringify(doc(text)));
}

async function pageCopyOf(projectId: string, id: string): Promise<Bag> {
  const loaded = await loadProjectCore(projectId);
  return loaded.resources.find((r) => r.id === id) as Bag;
}

/** Stale page save; returns true if parseable and not rejected. */
async function staleSend(
  c: Counts,
  projectId: string,
  root: string,
  id: string,
  copy: Bag,
): Promise<boolean> {
  const stored = (await readSidecar(root, id)) as Bag;
  const sent: Bag = {
    ...copy,
    userMetadata: { ...((copy.userMetadata as Bag) ?? {}), mood: "calm" },
    wordCount: stored.wordCount,
  };
  try {
    await updateSidecarCore(projectId, id, sent);
  } catch {
    c.rejected++;
    return false;
  }
  try {
    JSON.parse(
      await fs.readFile(
        path.join(root, "meta", `resource-${id}.meta.json`),
        "utf8",
      ),
    );
  } catch {
    c.unparseable++;
    return false;
  }
  return true;
}

describe("E-1, E-2, E-3 sidecar stale copy (before values)", () => {
  it("records counts", async () => {
    const batch = await fs.mkdtemp(path.join(os.tmpdir(), "f93-e123-"));
    dirs.push(batch);
    process.env.GETWRITE_PROJECTS_DIR = batch;

    const e1 = newCounts();
    for (let i = 0; i < REPS_E1; i++) {
      const { projectId, projectRoot, id } = await setup(batch, `e1-${i}`);
      const copy = await pageCopyOf(projectId, id);
      try {
        await renameResourceSidecarCore(projectId, id, "Renamed Chapter");
      } catch {
        e1.rejected++;
        continue;
      }
      e1.repetitions++;
      if (!(await staleSend(e1, projectId, projectRoot, id, copy))) continue;
      const s = (await readSidecar(projectRoot, id)) as Bag;
      if (s.name === copy.name) e1.lostOrStale++;
      if (s.name === "Renamed Chapter") bump(e1, "storedNameIsRenamed");
    }

    const e2 = newCounts();
    for (let i = 0; i < REPS_E2; i++) {
      const { projectId, projectRoot, id } = await setup(batch, `e2-${i}`);
      await canonicalSave(projectRoot, id, "hello world again");
      await sleep(5);
      const copy = await pageCopyOf(projectId, id);
      await sleep(5);
      await canonicalSave(projectRoot, id, "hello world and more words");
      const u1 = ((await readSidecar(projectRoot, id)) as Bag).updatedAt;
      e2.repetitions++;
      if (copy.updatedAt === undefined) bump(e2, "copyWithoutUpdatedAt");
      if (String(u1) > String(copy.updatedAt)) bump(e2, "secondSaveAdvanced");
      if (!(await staleSend(e2, projectId, projectRoot, id, copy))) continue;
      const s = (await readSidecar(projectRoot, id)) as Bag;
      if (s.updatedAt === copy.updatedAt) e2.lostOrStale++;
      if (s.updatedAt === u1) bump(e2, "storedUpdatedAtIsNewer");
    }

    const e3 = newCounts();
    for (let i = 0; i < REPS_E3; i++) {
      const { projectId, projectRoot, id } = await setup(batch, `e3-${i}`);
      await setNoiseTermDismissedCore(projectId, id, "alpha", true);
      const copy = await pageCopyOf(projectId, id);
      try {
        await setNoiseTermDismissedCore(projectId, id, "hello", true);
      } catch {
        e3.rejected++;
        continue;
      }
      e3.repetitions++;
      if (!(await staleSend(e3, projectId, projectRoot, id, copy))) continue;
      const s = (await readSidecar(projectRoot, id)) as Bag;
      const list = (s.dismissedNoiseTerms as string[] | undefined) ?? [];
      if (!list.includes("hello")) e3.lostOrStale++;
      if (list.includes("hello")) bump(e3, "storedListHasHello");
    }

    const out = JSON.stringify({ batch, e1, e2, e3 }, null, 1);
    if (process.env.E123_RESULT_OUT)
      await fs.writeFile(process.env.E123_RESULT_OUT, out, "utf8");
    expect(e1.repetitions + e2.repetitions + e3.repetitions).toBeGreaterThan(0);
  }, 300_000);
});
