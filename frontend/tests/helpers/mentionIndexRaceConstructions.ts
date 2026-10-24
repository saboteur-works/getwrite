/**
 * Race constructions for the mention index (Feature 93, Task 18), ported from
 * specs/features/stale-saves-and-index-races/scripts/e8-constructions.ts.
 *
 * Every construction builds a throwaway project under a caller-supplied temp
 * directory, runs two real writers against it, and returns what was stored.
 * Nothing here asserts; the caller counts. Two start modes:
 *  - "natural": both writers are started in the same tick (Promise.all), as
 *    the Feature 92 / inverted-index precedent does.
 *  - "gated": the storage adapter holds every read of meta/index/mentions.json
 *    until two reads have arrived (or GATE_RELEASE_MS passes), so both writers
 *    hold a copy loaded before either saved. The adapter is injectable, so no
 *    source is changed.
 * Writers are the real functions: removeResourceFromMentionIndex,
 * enqueueIndex (runTask's mention step; runTask is not exported),
 * enqueueEntityRescan (rescanEntityAcrossProject; not exported) and
 * loadMentionIndex + persistMentionIndex.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { RmOptions } from "node:fs";
import { setStorageAdapter } from "../../src/lib/models/io";
import {
  enqueueEntityRescan,
  enqueueIndex,
} from "../../src/lib/models/indexer-queue";
import {
  loadMentionIndex,
  persistMentionIndex,
  removeResourceFromMentionIndex,
  type MentionIndex,
  type MentionRecord,
} from "../../src/lib/models/mention-index";

export type Mode = "natural" | "gated";
export type PairId =
  | "removeVsRunTask"
  | "removeVsRescan"
  | "rescanVsRunTask"
  | "persistVsPersist";

const REP_TIMEOUT_MS = 5000;
const GATE_RELEASE_MS = 500;

export interface Outcome {
  pair: PairId;
  mode: Mode;
  hung: boolean;
  rejected: boolean;
  unparseable: boolean;
  /** Names of expected changes absent from the stored index. */
  lost: string[];
  /** Number of mentions.json reads the gate saw (gated mode only). */
  gateReads: number;
}

type Gate = { reads: number };

function installAdapter(gate: Gate | null): void {
  const target = "meta/index/mentions.json";
  const waiters: Array<() => void> = [];
  const adapter = {
    mkdir: async (p: string, o?: unknown) => {
      await fs.mkdir(p, o as never);
    },
    writeFile: (p: string, d: unknown, o?: unknown) =>
      fs.writeFile(p, d as never, o as never),
    readFile: async (p: string, e?: unknown) => {
      if (gate && p.endsWith(target)) {
        gate.reads += 1;
        if (gate.reads >= 2) {
          for (const w of waiters.splice(0)) w();
        } else {
          await new Promise<void>((resolve) => {
            waiters.push(resolve);
            setTimeout(resolve, GATE_RELEASE_MS);
          });
        }
      }
      return fs.readFile(
        p,
        (e ?? "utf8") as never,
      ) as unknown as Promise<string>;
    },
    readdir: (p: string, o?: unknown) => fs.readdir(p, o as never) as never,
    stat: (p: string) => fs.stat(p) as never,
    rm: (p: string, o?: unknown) => fs.rm(p, o as RmOptions),
    rename: (a: string, b: string) => fs.rename(a, b),
  };
  setStorageAdapter(adapter as never);
}

async function addResource(
  root: string,
  id: string,
  name: string,
  text: string,
  entityKind?: string,
): Promise<void> {
  await fs.mkdir(path.join(root, "resources", id), { recursive: true });
  await fs.writeFile(
    path.join(root, "resources", id, "content.txt"),
    text,
    "utf8",
  );
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  const side: Record<string, unknown> = { id, name, type: "text" };
  if (entityKind) side.entityKind = entityKind;
  await fs.writeFile(
    path.join(root, "meta", `resource-${id}.meta.json`),
    JSON.stringify(side),
    "utf8",
  );
}

const rec = (entityId: string, resourceId: string): MentionRecord => ({
  entityId,
  resourceId,
  count: 1,
  offsets: [0],
});

async function writeIndex(root: string, index: MentionIndex): Promise<void> {
  await fs.mkdir(path.join(root, "meta", "index"), { recursive: true });
  await fs.writeFile(
    path.join(root, "meta", "index", "mentions.json"),
    JSON.stringify(index, null, 2),
    "utf8",
  );
}

async function readStored(root: string): Promise<MentionIndex | null> {
  try {
    return JSON.parse(
      await fs.readFile(
        path.join(root, "meta", "index", "mentions.json"),
        "utf8",
      ),
    ) as MentionIndex;
  } catch {
    return null;
  }
}

function raceWithTimer<T>(
  p: Promise<T>,
): Promise<{ hung: boolean; rejected: boolean }> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ hung: true, rejected: false }),
      REP_TIMEOUT_MS,
    );
    p.then(
      () => {
        clearTimeout(timer);
        resolve({ hung: false, rejected: false });
      },
      () => {
        clearTimeout(timer);
        resolve({ hung: false, rejected: true });
      },
    );
  });
}

/**
 * Fixed layout (ids are plain strings; nothing validates them):
 *   E "ent-aldric" (entity, name "Aldric"), F "ent-brynn" (entity, "Brynn"),
 *   X "res-x" (text "Aldric walked."), Y "res-y", Z "res-z".
 */
interface Plan {
  expect: Array<{ name: string; check: (idx: MentionIndex) => boolean }>;
  run: (root: string) => Promise<unknown>;
}

async function buildPlan(pair: PairId, root: string): Promise<Plan> {
  await addResource(root, "ent-aldric", "Aldric", "", "character");
  await addResource(root, "ent-brynn", "Brynn", "", "character");
  const has = (idx: MentionIndex, r: string, e: string) =>
    (idx[r] ?? []).some((x) => x.entityId === e);

  if (pair === "removeVsRunTask") {
    // X was in the index and is removed (its folder is gone, as after a trash
    // move); Y is saved and indexed. Expected: X absent, Y has Brynn.
    await addResource(root, "res-y", "Y", "Brynn waited.");
    await writeIndex(root, { "res-x": [rec("ent-aldric", "res-x")] });
    return {
      expect: [
        { name: "X removal", check: (i) => !("res-x" in i) },
        {
          name: "Y mention record",
          check: (i) => has(i, "res-y", "ent-brynn"),
        },
      ],
      run: () =>
        Promise.all([
          removeResourceFromMentionIndex(root, "res-x"),
          enqueueIndex(root, "res-y"),
        ]),
    };
  }
  if (pair === "removeVsRescan") {
    // Rescan of Aldric finds Z (new text); X is removed. Expected: X absent,
    // Z has Aldric.
    await addResource(root, "res-z", "Z", "Aldric spoke.");
    await writeIndex(root, { "res-x": [rec("ent-aldric", "res-x")] });
    return {
      expect: [
        { name: "X removal", check: (i) => !("res-x" in i) },
        {
          name: "Z mention record",
          check: (i) => has(i, "res-z", "ent-aldric"),
        },
      ],
      run: () =>
        Promise.all([
          removeResourceFromMentionIndex(root, "res-x"),
          enqueueEntityRescan(root, "ent-aldric"),
        ]),
    };
  }
  if (pair === "rescanVsRunTask") {
    // Rescan of Aldric finds Z; runTask indexes Y (Brynn). Expected: both.
    await addResource(root, "res-y", "Y", "Brynn waited.");
    await addResource(root, "res-z", "Z", "Aldric spoke.");
    await writeIndex(root, {});
    return {
      expect: [
        {
          name: "Z Aldric record (rescan)",
          check: (i) => has(i, "res-z", "ent-aldric"),
        },
        {
          name: "Y Brynn record (runTask)",
          check: (i) => has(i, "res-y", "ent-brynn"),
        },
      ],
      run: () =>
        Promise.all([
          enqueueEntityRescan(root, "ent-aldric"),
          enqueueIndex(root, "res-y"),
        ]),
    };
  }
  // persistVsPersist: two callers in the load, change, persist shape that
  // runTask, importers and reindex use, each adding a different key.
  await writeIndex(root, {});
  const caller = async (key: string): Promise<void> => {
    const idx = await loadMentionIndex(root);
    idx[key] = [rec("ent-aldric", key)];
    await persistMentionIndex(root, idx);
  };
  return {
    expect: [
      { name: "caller 1 key", check: (i) => "key-1" in i },
      { name: "caller 2 key", check: (i) => "key-2" in i },
    ],
    run: () => Promise.all([caller("key-1"), caller("key-2")]),
  };
}

/** One repetition of one pair in one mode, under `root` (created here). */
export async function runRepetition(
  pair: PairId,
  mode: Mode,
  root: string,
): Promise<Outcome> {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({ id: "p", name: "P", config: {} }),
    "utf8",
  );
  const gate: Gate | null = mode === "gated" ? { reads: 0 } : null;
  installAdapter(null); // setup writes go through the plain adapter
  const plan = await buildPlan(pair, root);
  installAdapter(gate);
  const { hung: isHung, rejected: isRejected } = await raceWithTimer(
    plan.run(root),
  );
  const stored = await readStored(root);
  return {
    pair,
    mode,
    hung: isHung,
    rejected: isRejected,
    unparseable: stored === null,
    lost: stored
      ? plan.expect.filter((e) => !e.check(stored)).map((e) => e.name)
      : plan.expect.map((e) => e.name),
    gateReads: gate?.reads ?? 0,
  };
}
