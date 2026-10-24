/**
 * Feature 92 FR-12 (Task 24): deadlock test for the per-file lock together
 * with `withMetaLock` and `acquireLock`, under the test-only lock-order guard
 * (`tests/helpers/lockOrderGuard.ts`, installed by `tests/setup.ts`).
 *
 * Every repetition starts, on one project and one resource, one operation from
 * each `project.json` family (A = `updateEditorConfigCore`, B =
 * `setWordCountGoalCore`, C = `addField`, D = `updateFeatureConfig`, E = the
 * `metadataRevision` bump inside `updateSidecarCore`), `changeFieldTypeWithMigration`,
 * and a writer of each sidecar family (S1 `updateSidecarCore`, S2
 * `updateRevisionInPlace`, S3 `clearField` through `forEachUserMetadata`, S4
 * `setNoiseTermDismissedCore` and `renameResourceSidecarCore`).
 *
 * Orderings differ in start order and in whether `updateRevisionInPlace`, which
 * holds the `revision-content:` `acquireLock` across its body, starts before
 * or after the others (the edge `acquireLock(revision-content) -> withMetaLock
 * -> file lock`). Each repetition races a 5 s timer: a hung repetition fails
 * the test with the ordering and repetition named, and the suite carries on.
 * The guard throws `LockOrderViolationError` on a forbidden edge, which shows
 * here as a rejected operation.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { updateEditorConfigCore } from "../../src/lib/models/editor-config-core";
import { setWordCountGoalCore } from "../../src/lib/models/word-count-goal-core";
import { updateFeatureConfig } from "../../src/lib/models/project-features";
import {
  addField,
  changeFieldTypeWithMigration,
  clearField,
} from "../../src/lib/models/metadata-schema";
import {
  renameResourceSidecarCore,
  setNoiseTermDismissedCore,
  updateSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { listRevisions, writeRevision } from "../../src/lib/models/revision";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";

const REPS = 20;
const BOUND_MS = 5000;
const GROUP_ID = "custom-group";
const T0 = "2026-01-01T00:00:00.000Z";

const dirs: string[] = [];
const originalEnv = process.env.GETWRITE_PROJECTS_DIR;

afterEach(async () => {
  await flushIndexer();
  if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  for (const dir of dirs.splice(0)) await removeDirRetry(dir);
});

interface Rep {
  projectRoot: string;
  projectId: string;
  resourceId: string;
  revisionId: string;
}

const doc = (text: string): string =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

async function makeRep(): Promise<Rep> {
  const batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-deadlock-"));
  dirs.push(batchRoot);
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  const projectId = generateUUID();
  const projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  const project = createProject({ name: "deadlock" });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify({
      ...project,
      config: {
        ...project.config,
        metadataSchema: {
          groups: [
            {
              id: GROUP_ID,
              label: "Plot",
              fields: [
                { key: "tone", label: "Tone", type: "text" },
                { key: "genre", label: "Genre", type: "text" },
              ],
            },
          ],
        },
      },
    }),
    "utf8",
  );
  const resourceId = generateUUID();
  await writeRevision(projectRoot, resourceId, 1, doc("base text"), {
    isCanonical: true,
  });
  const [revision] = await listRevisions(projectRoot, resourceId);
  await writeSidecar(projectRoot, resourceId, {
    id: resourceId,
    updatedAt: T0,
    name: "Scene",
    marker: "before",
    userMetadata: { tone: "ominous", genre: "x", other: "keep" },
  } as Record<string, MetadataValue>);
  return { projectRoot, projectId, resourceId, revisionId: revision!.id };
}

type OpId = "A" | "B" | "C" | "D" | "F" | "S1" | "S2" | "S3" | "S4a" | "S4b";

const OPS: Record<OpId, (rep: Rep, i: number) => Promise<unknown>> = {
  A: (rep) =>
    updateEditorConfigCore({
      projectId: rep.projectId,
      body: { fontSize: "19px" },
    }),
  B: (rep) => setWordCountGoalCore(rep.projectId, 4321),
  C: (rep) =>
    addField(rep.projectRoot, GROUP_ID, {
      key: "mood",
      label: "Mood",
      type: "text",
    }),
  D: (rep) => updateFeatureConfig(rep.projectRoot, { subtypes: ["Scene"] }),
  F: (rep) =>
    changeFieldTypeWithMigration(
      rep.projectRoot,
      GROUP_ID,
      "genre",
      "select",
      ["x", "y"],
      { x: { action: "normalize", normalizedTo: "y" } },
    ),
  S1: (rep) =>
    updateSidecarCore(rep.projectId, rep.resourceId, { marker: "after" }),
  S2: (rep, i) =>
    updateRevisionInPlace(
      rep.projectRoot,
      rep.resourceId,
      rep.revisionId,
      doc(`edited ${i}`),
    ),
  S3: (rep) => clearField(rep.projectRoot, GROUP_ID, "tone"),
  S4a: (rep) =>
    setNoiseTermDismissedCore(rep.projectId, rep.resourceId, "plain", true),
  S4b: (rep) => renameResourceSidecarCore(rep.projectId, rep.resourceId, "New"),
};

const FORWARD: OpId[] = [
  "A",
  "B",
  "C",
  "D",
  "F",
  "S1",
  "S2",
  "S3",
  "S4a",
  "S4b",
];

interface Ordering {
  name: string;
  /** Operations started first, then a macrotask yield, then `rest`. */
  head: OpId[];
  rest: OpId[];
}

const without = (ids: OpId[]): OpId[] =>
  FORWARD.filter((o) => !ids.includes(o));

const ORDERINGS: Ordering[] = [
  { name: "forward", head: [], rest: FORWARD },
  { name: "reverse", head: [], rest: [...FORWARD].reverse() },
  { name: "revision-content first", head: ["S2"], rest: without(["S2"]) },
  { name: "revision-content last", head: without(["S2"]), rest: ["S2"] },
  {
    name: "sidecar writers first, schema writers after",
    head: ["S1", "S4a", "S4b", "S2", "S3"],
    rest: ["F", "C", "D", "B", "A"],
  },
];

const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/** Starts the ordering's operations; resolves with each operation's outcome. */
async function runOrdering(
  rep: Rep,
  i: number,
  ordering: Ordering,
): Promise<PromiseSettledResult<unknown>[]> {
  const started: Promise<unknown>[] = [];
  for (const id of ordering.head) started.push(OPS[id](rep, i));
  if (ordering.head.length > 0) await tick();
  for (const id of ordering.rest) started.push(OPS[id](rep, i));
  return Promise.allSettled(started);
}

type Outcome =
  | { kind: "done"; ms: number; failures: string[] }
  | { kind: "hung" };

async function timedRep(
  rep: Rep,
  i: number,
  ordering: Ordering,
): Promise<Outcome> {
  const begin = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hung = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "hung" }), BOUND_MS);
  });
  const done = runOrdering(rep, i, ordering).then((settled): Outcome => {
    const ids = [...ordering.head, ...ordering.rest];
    const failures: string[] = [];
    settled.forEach((s, n) => {
      if (s.status === "rejected") {
        failures.push(
          `${ids[n]}: ${String((s.reason as Error)?.message ?? s.reason)}`,
        );
      }
    });
    return { kind: "done", ms: performance.now() - begin, failures };
  });
  const outcome = await Promise.race([done, hung]);
  clearTimeout(timer);
  return outcome;
}

async function filesParse(rep: Rep): Promise<string[]> {
  const bad: string[] = [];
  const files = [
    path.join(rep.projectRoot, PROJECT_FILENAME),
    path.join(rep.projectRoot, "meta", `resource-${rep.resourceId}.meta.json`),
  ];
  for (const file of files) {
    try {
      JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      bad.push(`unparseable:${path.basename(file)}`);
    }
  }
  return bad;
}

describe.each(ORDERINGS)("lock deadlock: $name", (ordering) => {
  it(`all families finish within ${BOUND_MS} ms (${REPS} repetitions)`, async () => {
    const failures: string[] = [];
    let worst = 0;
    for (let i = 0; i < REPS; i += 1) {
      const rep = await makeRep();
      const outcome = await timedRep(rep, i, ordering);
      if (outcome.kind === "hung") {
        failures.push(`${i}: no completion within ${BOUND_MS} ms`);
        break; // the hung locks hold the event loop's work; stop this ordering
      }
      worst = Math.max(worst, outcome.ms);
      for (const f of outcome.failures) failures.push(`${i}: rejected ${f}`);
      for (const f of await filesParse(rep)) failures.push(`${i}: ${f}`);
    }
    console.info(
      `[deadlock] ${ordering.name}: slowest repetition ${worst.toFixed(0)} ms`,
    );
    expect(failures).toEqual([]);
  }, 180000);
});
