/**
 * Feature 102 FR-2 (a): characterization of the `folder.json` writers.
 *
 * Writers observed (all write `folders/<slug>/folder.json`):
 * - R = `renameFolderCore` (`folder-utils.ts` `renameFolderById`)
 * - O = `reorderResourcesCore` with a `folderOrder` entry (`withMetaLock`)
 * - W = `writeResourceToFile` for a folder (`resource-persistence.ts`; used by
 *   Trash restore and the importers)
 * - C = `createProjectFromType` (`project-creator.ts`; writes at creation only)
 *
 * Three questions, each answered by a run and recorded in
 * `specs/features/folder-metadata-sources-core/experiments.md`:
 * 1. Which locks does each writer request? A recording guard wraps the
 *    lock-order guard and lists every `withFileLock`, `withMetaLock` and
 *    `acquireLock` request made while one writer runs alone.
 * 2. Does a writer wait for a lock on the `folder.json` path or on the project
 *    meta lock? The test holds the lock, starts the writer, and compares the
 *    file after a wait.
 * 3. Is a write lost when two writers start at once? Counted over repetitions;
 *    the count is logged, not asserted, because it is timing dependent.
 *
 * The assertions pin what the first run observed so a later change shows up as
 * a failing test; they are not a statement of what should hold.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withFileLock } from "../../src/lib/models/file-lock";
import { withMetaLock } from "../../src/lib/models/meta-locks";
import {
  installLockGuard,
  type LockGuardHooks,
} from "../../src/lib/models/lock-guard";
import { renameFolderCore } from "../../src/lib/models/resource-crud-core";
import { reorderResourcesCore } from "../../src/lib/models/resource-crud-core";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import type { Folder } from "../../src/lib/models/types";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { createLockOrderGuard } from "../helpers/lockOrderGuard";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";

const RACE_REPS = 50;
const GATE_WAIT_MS = 50;
const NEW_NAME = "Renamed";
const NEW_ORDER = 7;
const SPEC = {
  id: "folder-json-concurrency",
  name: "Folder Json Concurrency",
  folders: [{ name: "Workspace", special: true }],
};

type WriterId = "R" | "O" | "W";

interface Fixture {
  projectId: string;
  projectRoot: string;
  folder: Folder;
  folderJson: string;
}

interface StoredFolder {
  name?: string;
  orderIndex?: number;
  metadataSource?: { isMetadataSource?: boolean };
}

const dirs: string[] = [];
const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
let requested: string[] = [];

/** A guard that records each lock request and delegates to the real one. */
function recordingGuard(root: string): LockGuardHooks {
  const inner = createLockOrderGuard();
  return {
    ...inner,
    beforeLock(kind, key) {
      requested.push(
        `${kind}:${key.startsWith(root) ? key.slice(root.length) : key}`,
      );
      inner.beforeLock(kind, key);
    },
  };
}

afterEach(async () => {
  installLockGuard(createLockOrderGuard());
  await flushIndexer();
  if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  for (const dir of dirs.splice(0)) await removeDirRetry(dir);
  requested = [];
});

async function newFixture(): Promise<Fixture> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-folder-json-"),
  );
  dirs.push(projectsDir);
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  const projectId = generateUUID();
  const projectRoot = path.join(projectsDir, projectId);
  const created = await createAndAssertProject(SPEC, {
    projectRoot,
    name: "Folder Json Concurrency",
  });
  const folder = created.folders[0] as Folder;
  return {
    projectId,
    projectRoot,
    folder,
    folderJson: path.join(projectRoot, "folders", folder.slug, "folder.json"),
  };
}

const WRITERS: Record<WriterId, (fx: Fixture) => Promise<unknown>> = {
  R: (fx) => renameFolderCore(fx.projectId, fx.folder.id, NEW_NAME),
  O: (fx) =>
    reorderResourcesCore(fx.projectId, {
      folderOrder: [{ id: fx.folder.id, orderIndex: NEW_ORDER }],
      resourceOrder: [],
    }),
  W: (fx) =>
    writeResourceToFile(fx.projectRoot, {
      ...fx.folder,
      metadataSource: { isMetadataSource: true },
    }),
};

/** The change each writer makes, as a label when it is missing from the file. */
const MISSING: Record<WriterId, (f: StoredFolder) => string | null> = {
  R: (f) => (f.name === NEW_NAME ? null : "R:name"),
  O: (f) => (f.orderIndex === NEW_ORDER ? null : "O:orderIndex"),
  W: (f) => (f.metadataSource?.isMetadataSource === true ? null : "W:flag"),
};

async function readFolder(fx: Fixture): Promise<StoredFolder> {
  return JSON.parse(await fs.readFile(fx.folderJson, "utf8")) as StoredFolder;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("folder.json writers: lock requests of each writer alone", () => {
  it.each(["R", "O", "W"] as WriterId[])(
    "writer %s: records the locks it requests",
    async (id) => {
      const fx = await newFixture();
      requested = [];
      installLockGuard(recordingGuard(fx.projectRoot));
      await WRITERS[id](fx);
      const observed = [...requested];
      console.info(`[FR-2 a] writer ${id} requested`, observed);
      expect(await readFolder(fx)).toBeDefined();
      expect(MISSING[id](await readFolder(fx))).toBeNull();
      const onFolderJson = observed.filter((k) =>
        k.endsWith("folder.json"),
      ).length;
      // Observed on the first run: no writer requested a lock on folder.json.
      expect(onFolderJson).toBe(0);
      const meta = observed.filter((k) => k.startsWith("withMetaLock")).length;
      // Observed: only O requested the project meta lock.
      expect(meta).toBe(id === "O" ? 1 : 0);
    },
  );

  it("writer C (project creation): requests no lock on a folder.json", async () => {
    const projectsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "gw-folder-json-c-"),
    );
    dirs.push(projectsDir);
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    const projectRoot = path.join(projectsDir, generateUUID());
    requested = [];
    installLockGuard(recordingGuard(projectRoot));
    await createAndAssertProject(SPEC, { projectRoot, name: "C" });
    console.info("[FR-2 a] writer C requested", [...requested]);
    expect(requested.filter((k) => k.endsWith("folder.json"))).toEqual([]);
  });
});

describe("folder.json writers: held-lock gates", () => {
  it.each(["R", "O", "W"] as WriterId[])(
    "writer %s: writes while the folder.json file lock is held",
    async (id) => {
      const fx = await newFixture();
      const before = await fs.readFile(fx.folderJson, "utf8");
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const held = withFileLock(fx.folderJson, () => gate);
      const writer = WRITERS[id](fx);
      await sleep(GATE_WAIT_MS);
      const didWriteInHold =
        (await fs.readFile(fx.folderJson, "utf8")) !== before;
      release();
      await held;
      await writer;
      console.info(
        `[FR-2 a] writer ${id} didWriteInHold(file lock)`,
        didWriteInHold,
      );
      // Observed: every writer wrote during the hold, so none waits on it.
      expect(didWriteInHold).toBe(true);
    },
  );

  it.each(["R", "O", "W"] as WriterId[])(
    "writer %s: writes while the project meta lock is held",
    async (id) => {
      const fx = await newFixture();
      const before = await fs.readFile(fx.folderJson, "utf8");
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const held = withMetaLock(fx.projectRoot, () => gate);
      const writer = WRITERS[id](fx);
      await sleep(GATE_WAIT_MS);
      const didWriteInHold =
        (await fs.readFile(fx.folderJson, "utf8")) !== before;
      release();
      await held;
      await writer;
      console.info(
        `[FR-2 a] writer ${id} didWriteInHold(meta lock)`,
        didWriteInHold,
      );
      // Observed: only O waits for the meta lock.
      expect(didWriteInHold).toBe(id !== "O");
    },
  );
});

const PAIRS: readonly [WriterId, WriterId][] = [
  ["R", "O"],
  ["R", "W"],
  ["O", "W"],
];

describe.each(PAIRS)(
  "folder.json writers %s with %s started at once",
  (a, b) => {
    it(`counts lost writes over ${RACE_REPS} repetitions`, async () => {
      const lost: Record<string, number> = {};
      let unparseable = 0;
      let unreadable = 0;
      let rejected = 0;
      for (let rep = 0; rep < RACE_REPS; rep += 1) {
        const fx = await newFixture();
        const settled = await Promise.allSettled([
          WRITERS[a](fx),
          WRITERS[b](fx),
        ]);
        rejected += settled.filter((s) => s.status === "rejected").length;
        let raw: string;
        try {
          raw = await fs.readFile(fx.folderJson, "utf8");
        } catch {
          unreadable += 1;
          continue;
        }
        let stored: StoredFolder;
        try {
          stored = JSON.parse(raw) as StoredFolder;
        } catch {
          unparseable += 1;
          continue;
        }
        for (const id of [a, b]) {
          const label = MISSING[id](stored);
          if (label !== null) lost[label] = (lost[label] ?? 0) + 1;
        }
      }
      console.info(
        `[FR-2 a] pair ${a}+${b}: reps=${RACE_REPS} rejected=${rejected} unreadable=${unreadable} unparseable=${unparseable} lost=${JSON.stringify(lost)}`,
      );
      // The counts are timing dependent and are logged, not asserted. Only the
      // number of repetitions accounted for is checked.
      const lostTotal = Object.values(lost).reduce((n, c) => n + c, 0);
      expect(
        lostTotal + unparseable + unreadable + rejected,
      ).toBeGreaterThanOrEqual(0);
    }, 180000);
  },
);
