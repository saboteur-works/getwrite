/**
 * Reusable race constructions for the backlinks index (Feature 93, E-9 and the
 * Task 18/21 race tests). NOT part of the suite.
 *
 * Every construction builds a throwaway project under a caller-supplied temp
 * directory, runs two real writers against it, and returns what was stored in
 * meta/backlinks.json. Nothing here asserts; the caller counts. Two start modes:
 *  - "natural": both writers are started in the same tick (Promise.all).
 *  - "gated": the order "one writer holds a copy older than the other's save,
 *    then saves last" is forced, without changing source:
 *      * pairs that load (removeResourceFromBacklinks, load+persist callers):
 *        the storage adapter reads meta/backlinks.json at once, then withholds
 *        the result from the caller until the gate opens (the other writer has
 *        finished, or two reads have arrived; 1.5 s release otherwise);
 *      * pairs that compute (computeBacklinks then persistBacklinks, the shape
 *        of backlinks-watcher.ts:46-62 and runTask's backlinks step): the
 *        construction computes first, lets the other writer run to completion,
 *        then calls persistBacklinks with the older result.
 * Writers are the real functions: removeResourceFromBacklinks,
 * persistBacklinks, computeBacklinks, loadBacklinks and enqueueIndex (the only
 * entry to runTask, which is not exported). The watcher itself is not started
 * (ensureBacklinkWatcher skips under the test runner); the watcher's callback
 * body is reproduced as runForTenant(computeBacklinks, persistBacklinks).
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  getStorageAdapter,
  runForTenant,
  setStorageAdapter,
} from "../../../../frontend/src/lib/models/io";
import { enqueueIndex } from "../../../../frontend/src/lib/models/indexer-queue";
import {
  computeBacklinks,
  loadBacklinks,
  persistBacklinks,
  removeResourceFromBacklinks,
  type BacklinkIndex,
} from "../../../../frontend/src/lib/models/backlinks";

export type Mode = "natural" | "gated";
export type PairId =
  | "removeVsPersist"
  | "persistVsPersist"
  | "watcherVsRunTask"
  | "removeVsRunTask"
  | "removeVsRecompute";
export const PAIRS: PairId[] = [
  "removeVsPersist",
  "persistVsPersist",
  "watcherVsRunTask",
  "removeVsRunTask",
  "removeVsRecompute",
];

export const REP_TIMEOUT_MS = 20000;
const GATE_RELEASE_MS = 1500;

export interface Outcome {
  pair: PairId;
  mode: Mode;
  hung: boolean;
  rejected: boolean;
  unparseable: boolean;
  /** Names of expected changes absent from the stored index. */
  lost: string[];
  /** Number of backlinks.json reads the gate saw (gated, load pairs only). */
  gateReads: number;
  /** Gated load pairs: reads whose snapshot equalled the seed file. */
  gateSeedSnapshots: number;
}

interface Signal {
  promise: Promise<void>;
  open: () => void;
}
function makeSignal(): Signal {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

type Gate = {
  kind: "afterSignal" | "twoReads";
  signal: Signal;
  seed: string;
  reads: number;
  seedSnapshots: number;
};

function installAdapter(gate: Gate | null): void {
  const target = "meta/backlinks.json";
  const adapter = {
    mkdir: async (p: string, o?: unknown) => {
      await fs.mkdir(p, o as never);
    },
    writeFile: (p: string, d: unknown, o?: unknown) =>
      fs.writeFile(p, d as never, o as never),
    readFile: async (p: string, e?: unknown) => {
      const content = (await fs.readFile(p, (e ?? "utf8") as never)) as unknown as string;
      if (gate && p.endsWith(target)) {
        gate.reads += 1;
        if (content === gate.seed) gate.seedSnapshots += 1;
        if (gate.kind === "twoReads" && gate.reads >= 2) gate.signal.open();
        await Promise.race([
          gate.signal.promise,
          new Promise<void>((resolve) => setTimeout(resolve, GATE_RELEASE_MS)),
        ]);
      }
      return content;
    },
    readdir: (p: string, o?: unknown) => fs.readdir(p, o as never) as never,
    stat: (p: string) => fs.stat(p) as never,
    rm: (p: string, o?: unknown) => fs.rm(p, o),
    rename: (a: string, b: string) => fs.rename(a, b),
  };
  setStorageAdapter(adapter as never);
}

/** Ids are UUIDs because computeBacklinks finds links by UUID in text. */
export const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const Z = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

async function addResource(root: string, id: string, text: string): Promise<void> {
  await fs.mkdir(path.join(root, "resources", id), { recursive: true });
  await fs.writeFile(path.join(root, "resources", id, "content.txt"), text, "utf8");
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(
    path.join(root, "meta", `resource-${id}.meta.json`),
    JSON.stringify({ id, name: id, type: "text" }),
    "utf8",
  );
}

async function setContent(root: string, id: string, text: string): Promise<void> {
  await fs.writeFile(path.join(root, "resources", id, "content.txt"), text, "utf8");
}

const BACKLINKS = (root: string) => path.join(root, "meta", "backlinks.json");

async function writeSeed(root: string, index: BacklinkIndex): Promise<string> {
  const raw = JSON.stringify(index, null, 2);
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(BACKLINKS(root), raw, "utf8");
  return raw;
}

async function readStored(root: string): Promise<BacklinkIndex | null> {
  try {
    return JSON.parse(await fs.readFile(BACKLINKS(root), "utf8")) as BacklinkIndex;
  } catch {
    return null;
  }
}

function raceWithTimer<T>(p: Promise<T>): Promise<{ hung: boolean; rejected: boolean }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ hung: true, rejected: false }), REP_TIMEOUT_MS);
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

const refs = (idx: BacklinkIndex, from: string, to: string): boolean =>
  (idx[from] ?? []).includes(to);
const anyRefTo = (idx: BacklinkIndex, to: string): boolean =>
  Object.values(idx).some((r) => r.includes(to));

interface Plan {
  expect: Array<{ name: string; check: (idx: BacklinkIndex) => boolean }>;
  gate: Gate | null;
  run: (root: string) => Promise<unknown>;
}

/** The watcher callback body (backlinks-watcher.ts:46-62) as one call. */
const watcherBody = (root: string): Promise<void> =>
  runForTenant(
    root,
    async () => {
      const index = await computeBacklinks(root);
      await persistBacklinks(root, index);
    },
    getStorageAdapter(),
  );

async function buildPlan(pair: PairId, mode: Mode, root: string): Promise<Plan> {
  const gated = mode === "gated";
  const mkGate = (kind: Gate["kind"], seed: string): Gate | null =>
    gated ? { kind, signal: makeSignal(), seed, reads: 0, seedSnapshots: 0 } : null;

  if (pair === "removeVsPersist") {
    // Seed: X (folder absent, as after a trash move) is in the index and Y
    // refers to it. P saves a recomputed index that holds Y -> Z. R removes X.
    // Expected: no X key, no reference to X, and Y -> Z.
    await addResource(root, Y, `link ${Z}`);
    await addResource(root, Z, "");
    const seed = await writeSeed(root, { [X]: [Y], [Y]: [X], [Z]: [] });
    const gate = mkGate("afterSignal", seed);
    return {
      gate,
      expect: [
        { name: "X removal", check: (i) => !(X in i) && !anyRefTo(i, X) },
        { name: "Y -> Z link (persist)", check: (i) => refs(i, Y, Z) },
      ],
      run: async () => {
        const p = persistBacklinks(root, { [Y]: [Z], [Z]: [] }).then(() => gate?.signal.open());
        await Promise.all([removeResourceFromBacklinks(root, X), p]);
      },
    };
  }
  if (pair === "persistVsPersist") {
    // Two callers in the load, change, persist shape; each adds its own key.
    const seed = await writeSeed(root, {});
    const gate = mkGate("twoReads", seed);
    const caller = async (key: string): Promise<void> => {
      const idx = await loadBacklinks(root);
      idx[key] = [Z];
      await persistBacklinks(root, idx);
    };
    return {
      gate,
      expect: [
        { name: "caller 1 key", check: (i) => "key-1" in i },
        { name: "caller 2 key", check: (i) => "key-2" in i },
      ],
      run: () => Promise.all([caller("key-1"), caller("key-2")]),
    };
  }
  if (pair === "watcherVsRunTask") {
    // The change (Y gains a link to Z) lands after the watcher body's compute
    // has started (natural) or finished (gated). runTask for Y computes after
    // the change. Expected: Y -> Z.
    await addResource(root, Y, "nothing yet");
    await addResource(root, Z, "");
    await writeSeed(root, {});
    const change = async (): Promise<void> => {
      await setContent(root, Y, `link ${Z}`);
      await enqueueIndex(root, Y);
    };
    return {
      gate: null,
      expect: [{ name: "Y -> Z link (runTask)", check: (i) => refs(i, Y, Z) }],
      run: async () => {
        if (!gated) {
          await Promise.all([watcherBody(root), change()]);
          return;
        }
        const older = await computeBacklinks(root);
        await change();
        await runForTenant(root, () => persistBacklinks(root, older), getStorageAdapter());
      },
    };
  }
  if (pair === "removeVsRunTask") {
    // X's folder is absent and X is in the index. runTask for Y recomputes
    // after Y gains a link to Z. R removes X. Expected: no X, Y -> Z.
    await addResource(root, Y, "nothing yet");
    await addResource(root, Z, "");
    const seed = await writeSeed(root, { [X]: [Y], [Y]: [X], [Z]: [] });
    await setContent(root, Y, `link ${Z}`);
    const gate = mkGate("afterSignal", seed);
    return {
      gate,
      expect: [
        { name: "X removal", check: (i) => !(X in i) && !anyRefTo(i, X) },
        { name: "Y -> Z link (runTask)", check: (i) => refs(i, Y, Z) },
      ],
      run: async () => {
        const t = enqueueIndex(root, Y).then(() => gate?.signal.open());
        await Promise.all([removeResourceFromBacklinks(root, X), t]);
      },
    };
  }
  // removeVsRecompute: a recompute (the runTask / watcher compute step) whose
  // snapshot still lists X, a removal of X, then the recompute saves.
  await addResource(root, X, `link ${Y}`);
  await addResource(root, Y, `link ${X}`);
  await writeSeed(root, { [X]: [Y], [Y]: [X] });
  const removeX = async (): Promise<void> => {
    await fs.rm(path.join(root, "resources", X), { recursive: true, force: true });
    await removeResourceFromBacklinks(root, X);
  };
  return {
    gate: null,
    expect: [{ name: "X removal", check: (i) => !(X in i) && !anyRefTo(i, X) }],
    run: async () => {
      if (!gated) {
        await Promise.all([watcherBody(root), removeX()]);
        return;
      }
      const older = await computeBacklinks(root);
      await removeX();
      await runForTenant(root, () => persistBacklinks(root, older), getStorageAdapter());
    },
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
  installAdapter(null); // setup writes go through the plain adapter
  const plan = await buildPlan(pair, mode, root);
  installAdapter(plan.gate);
  const { hung, rejected } = await raceWithTimer(plan.run(root));
  const stored = await readStored(root);
  return {
    pair,
    mode,
    hung,
    rejected,
    unparseable: stored === null,
    lost: stored
      ? plan.expect.filter((e) => !e.check(stored)).map((e) => e.name)
      : plan.expect.map((e) => e.name),
    gateReads: plan.gate?.reads ?? 0,
    gateSeedSnapshots: plan.gate?.seedSnapshots ?? 0,
  };
}
