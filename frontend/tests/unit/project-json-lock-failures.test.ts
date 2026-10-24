/**
 * Feature 92, Task 25 (FR-14, FR-13, FR-23): failures raised inside the per-file
 * lock, and a single writer on an idle project.
 *
 * Part 1, failure propagation, for three writers on real temp-dir files:
 * `updateProjectJson` (the `project.json` lock), `mutateSidecar` and the
 * whole-object `writeSidecar` (the sidecar lock). For each failure the test
 * asserts that the error object reaches the caller unchanged, that the stored
 * file is byte-identical afterwards, that nothing resolved as saved (no
 * `metadataRevision` bump for a sidecar), that the lock was released (a queued
 * write behind the failure runs, a later write persists, and the lock key map
 * is back to its starting size). Failures are injected through wrappers around
 * the real `io.ts` functions (as `project-json-write.test.ts` does) or, for
 * `ProjectBusyError`, through the real `runWithWriteBarrier`.
 *
 * Already covered elsewhere, not repeated here: a throwing mutate callback
 * (`project-json-write.test.ts` "a throwing mutation reaches the caller...",
 * `sidecar.test.ts` "propagates a throwing mutate..."); an ENOENT
 * `project.json` (`project-json-write.test.ts`); a failure of the
 * `metadataRevision` bump itself (`sidecar.test.ts` "metadataRevision bump
 * lock order"); the sink's read error and locked-access error with a real
 * encrypting adapter (`sidecar.test.ts`); the lock primitive's own error
 * propagation and 300 ms wait (`file-lock.test.ts`).
 *
 * Part 2, single writer: one scenario per family (A to E, S1 to S4) is run on
 * the current tree and compared with a fixture captured by running the same
 * scenario file (`helpers/single-writer-scenarios.ts`) against the unchanged
 * tree (commit c8d0ab85, before any lock change).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/io", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/io")>();
  return {
    ...actual,
    atomicWriteFile: vi.fn(actual.atomicWriteFile),
    readFile: vi.fn(actual.readFile),
  };
});
vi.mock("../../src/lib/models/write-barrier", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/models/write-barrier")>();
  return { ...actual, assertWritable: vi.fn(actual.assertWritable) };
});

import baseline from "../fixtures/project-json-lock/single-writer-baseline.json";
import * as io from "../../src/lib/models/io";
import {
  fileLockKeyCountForTests,
  withFileLock,
} from "../../src/lib/models/file-lock";
import { updateProjectJson } from "../../src/lib/models/project-json-write";
import {
  mutateSidecar,
  sidecarPathForProject,
  writeSidecar,
} from "../../src/lib/models/sidecar";
import {
  ProjectBusyError,
  __resetWriteBarriersForTests,
  assertWritable,
  runWithWriteBarrier,
} from "../../src/lib/models/write-barrier";
import { runInStorageContext } from "../../src/lib/models/storage-context";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/crypto/adapter-selection";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { removeDirRetry } from "./helpers/fs-utils";
import {
  FROZEN_NOW,
  SCENARIOS,
  runScenario,
  type ScenarioSnapshot,
} from "./helpers/single-writer-scenarios";

const RESOURCE_ID = "22222222-2222-4222-8222-222222222222";
const SIDECAR_SEED = { id: RESOURCE_ID, name: "Scene", marker: "seed" };

let root = "";
let projectJsonPath = "";
let sidecarPath = "";
const realRead = vi.mocked(io.readFile).getMockImplementation()!;
const realWrite = vi.mocked(io.atomicWriteFile).getMockImplementation()!;

/** Rejects the next read (or all reads) of `file` with `error`. */
function failReadsOf(file: string, error: unknown): void {
  vi.mocked(io.readFile).mockImplementation(((p: string, ...rest: unknown[]) =>
    p === file
      ? Promise.reject(error)
      : (realRead as (...a: unknown[]) => Promise<unknown>)(
          p,
          ...rest,
        )) as typeof io.readFile);
}

/** Rejects the first write of `file` with `error`; later writes are real. */
function failNextWriteOf(file: string, error: unknown): void {
  let isSpent = false;
  vi.mocked(io.atomicWriteFile).mockImplementation(((
    p: string,
    ...rest: unknown[]
  ) => {
    if (!isSpent && p === file) {
      isSpent = true;
      return Promise.reject(error);
    }
    return (realWrite as (...a: unknown[]) => Promise<void>)(p, ...rest);
  }) as typeof io.atomicWriteFile);
}

interface Target {
  label: string;
  file: () => string;
  /** One write that sets `marker` to `tag`. `onMutate` runs inside the lock. */
  write: (tag: string, onMutate?: () => void) => Promise<unknown>;
  /** True when a write also bumps `metadataRevision` in `project.json`. */
  isSidecar: boolean;
  /** False for the whole-object write, which tolerates an unreadable prior file. */
  readsInsideLock: boolean;
}

const TARGETS: Target[] = [
  {
    label: "updateProjectJson (project.json lock)",
    file: () => projectJsonPath,
    write: (tag, onMutate) =>
      updateProjectJson(root, (project) => {
        onMutate?.();
        (project as unknown as Record<string, unknown>).marker = tag;
        return { result: tag };
      }),
    isSidecar: false,
    readsInsideLock: true,
  },
  {
    label: "mutateSidecar (sidecar lock)",
    file: () => sidecarPath,
    write: (tag, onMutate) =>
      mutateSidecar(root, RESOURCE_ID, (current) => {
        onMutate?.();
        return { ...(current ?? {}), marker: tag };
      }),
    isSidecar: true,
    readsInsideLock: true,
  },
  {
    label: "writeSidecar (whole object, sidecar lock)",
    file: () => sidecarPath,
    write: (tag) =>
      writeSidecar(root, RESOURCE_ID, { ...SIDECAR_SEED, marker: tag }),
    isSidecar: true,
    readsInsideLock: false,
  },
];

const readText = (file: string): Promise<string> => fs.readFile(file, "utf8");

async function metadataRevision(): Promise<number> {
  const project = JSON.parse(await readText(projectJsonPath)) as {
    config?: { metadataRevision?: number };
  };
  return project.config?.metadataRevision ?? 0;
}

async function storedMarker(target: Target): Promise<unknown> {
  return (JSON.parse(await readText(target.file())) as { marker?: unknown })
    .marker;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-lock-failures-"));
  projectJsonPath = path.join(root, "project.json");
  sidecarPath = sidecarPathForProject(root, RESOURCE_ID);
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(
    projectJsonPath,
    JSON.stringify(
      { id: "p", name: "P", marker: "seed", config: { metadataRevision: 5 } },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(
    sidecarPath,
    JSON.stringify(SIDECAR_SEED, null, 2),
    "utf8",
  );
  vi.mocked(io.readFile).mockImplementation(realRead);
  vi.mocked(io.atomicWriteFile).mockImplementation(realWrite);
  __resetWriteBarriersForTests();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.mocked(io.readFile).mockImplementation(realRead);
  vi.mocked(io.atomicWriteFile).mockImplementation(realWrite);
  __resetWriteBarriersForTests();
  await flushIndexer();
  await removeDirRetry(root);
});

/** What every failure must leave behind, shared by the cases below. */
async function expectNothingSavedAndLockFree(
  target: Target,
  bytesBefore: string,
  revisionBefore: number,
  keysBefore: number,
): Promise<void> {
  expect(await readText(target.file())).toBe(bytesBefore);
  if (target.isSidecar) expect(await metadataRevision()).toBe(revisionBefore);
  expect(fileLockKeyCountForTests()).toBe(keysBefore);
}

describe.each(TARGETS)("failure inside the lock: $label", (target) => {
  it("a failed write reaches the caller as the same object, saves nothing, and lets a queued and a later write run", async () => {
    const bytesBefore = await readText(target.file());
    const revisionBefore = await metadataRevision();
    const keysBefore = fileLockKeyCountForTests();
    const diskFull = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    failNextWriteOf(target.file(), diskFull);

    let isResolved = false;
    const failing = target.write("failing").then((value) => {
      isResolved = true;
      return value;
    });
    const queued = target.write("queued");

    await expect(failing).rejects.toBe(diskFull);
    expect(isResolved).toBe(false);
    await queued;
    // The failed write left the file whole; the queued write then ran on it.
    expect(await storedMarker(target)).toBe("queued");
    expect(fileLockKeyCountForTests()).toBe(keysBefore);
    expect(await readText(target.file())).not.toBe(bytesBefore);
    if (target.isSidecar) {
      expect(await metadataRevision()).toBe(revisionBefore + 1);
    }
    await target.write("later");
    expect(await storedMarker(target)).toBe("later");
  });

  it("a failed write alone leaves the stored bytes unchanged and, for a sidecar, bumps nothing", async () => {
    const bytesBefore = await readText(target.file());
    const revisionBefore = await metadataRevision();
    const keysBefore = fileLockKeyCountForTests();
    const boom = new Error("rename failed");
    failNextWriteOf(target.file(), boom);
    await expect(target.write("failing")).rejects.toBe(boom);
    await expectNothingSavedAndLockFree(
      target,
      bytesBefore,
      revisionBefore,
      keysBefore,
    );
    await target.write("later");
    expect(await storedMarker(target)).toBe("later");
  });

  it("a locked-access error on the write reaches the caller unchanged and saves nothing", async () => {
    const bytesBefore = await readText(target.file());
    const revisionBefore = await metadataRevision();
    const keysBefore = fileLockKeyCountForTests();
    const locked = new MissingProjectKeyError("p");
    failNextWriteOf(target.file(), locked);
    const error = await target.write("failing").then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBe(locked);
    expect(isLockedAccessError(error)).toBe(true);
    await expectNothingSavedAndLockFree(
      target,
      bytesBefore,
      revisionBefore,
      keysBefore,
    );
    await target.write("later");
    expect(await storedMarker(target)).toBe("later");
  });

  it("ProjectBusyError from the write barrier reaches the caller as the thrown object, saves nothing and frees the lock", async () => {
    const bytesBefore = await readText(target.file());
    const revisionBefore = await metadataRevision();
    const keysBefore = fileLockKeyCountForTests();
    const tenantRoot = path.dirname(root);
    let openBarrier!: () => void;
    const gate = new Promise<void>((resolve) => {
      openBarrier = resolve;
    });
    const holder = runWithWriteBarrier(root, () => gate);
    vi.mocked(assertWritable).mockClear();
    let isResolved = false;
    try {
      // A different async scope from the barrier holder: the write is refused.
      const refused = runInStorageContext(
        { tenantRoot, adapter: io.getStorageAdapter(), projectRoot: root },
        () => target.write("blocked"),
      ).then((value) => {
        isResolved = true;
        return value;
      });
      const error = await refused.then(
        () => null,
        (err: unknown) => err,
      );
      expect(error).toBeInstanceOf(ProjectBusyError);
      const thrown = vi
        .mocked(assertWritable)
        .mock.results.filter((r) => r.type === "throw")
        .map((r) => r.value);
      expect(thrown).toContain(error);
      expect(isResolved).toBe(false);
      await expectNothingSavedAndLockFree(
        target,
        bytesBefore,
        revisionBefore,
        keysBefore,
      );
    } finally {
      openBarrier();
      await holder;
    }
    // Barrier released: the same write on the same file now proceeds.
    await target.write("later");
    expect(await storedMarker(target)).toBe("later");
  });

  it("waits for the lock with no time limit, then saves", async () => {
    let openHold!: () => void;
    const hold = new Promise<void>((resolve) => {
      openHold = resolve;
    });
    let isHolding = false;
    const holder = withFileLock(target.file(), async () => {
      isHolding = true;
      await hold;
    });
    await vi.waitFor(() => expect(isHolding).toBe(true));
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
    let isSettled = false;
    const waiting = target.write("waited").finally(() => {
      isSettled = true;
    });
    // An hour of timer time passes; a timeout of any shorter length would fire.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(isSettled).toBe(false);
    expect(await storedMarker(target)).toBe("seed");
    vi.useRealTimers();
    openHold();
    await holder;
    await waiting;
    expect(await storedMarker(target)).toBe("waited");
  });
});

describe.each(TARGETS.filter((t) => t.readsInsideLock))(
  "read failure inside the lock: $label",
  (target) => {
    it("an unreadable file (EISDIR) rejects with the error, never calls mutate, saves nothing and frees the lock", async () => {
      const bytesBefore = await readText(target.file());
      const revisionBefore = await metadataRevision();
      await fs.rm(target.file());
      await fs.mkdir(target.file());
      const keysBefore = fileLockKeyCountForTests();
      const onMutate = vi.fn();
      await expect(target.write("failing", onMutate)).rejects.toMatchObject({
        code: "EISDIR",
      });
      expect(onMutate).not.toHaveBeenCalled();
      expect(fileLockKeyCountForTests()).toBe(keysBefore);
      expect((await fs.stat(target.file())).isDirectory()).toBe(true);
      if (target.isSidecar)
        expect(await metadataRevision()).toBe(revisionBefore);
      // Restoring the file lets a later write on the same path proceed.
      await fs.rm(target.file(), { recursive: true });
      await fs.writeFile(target.file(), bytesBefore, "utf8");
      await target.write("later");
      expect(await storedMarker(target)).toBe("later");
    });

    it("a parse error rejects with the SyntaxError, never calls mutate, leaves the bytes and frees the lock", async () => {
      const revisionBefore = await metadataRevision();
      await fs.writeFile(target.file(), "{bad", "utf8");
      const keysBefore = fileLockKeyCountForTests();
      const onMutate = vi.fn();
      await expect(target.write("failing", onMutate)).rejects.toBeInstanceOf(
        SyntaxError,
      );
      expect(onMutate).not.toHaveBeenCalled();
      expect(await readText(target.file())).toBe("{bad");
      expect(fileLockKeyCountForTests()).toBe(keysBefore);
      if (target.isSidecar)
        expect(await metadataRevision()).toBe(revisionBefore);
      await fs.writeFile(
        target.file(),
        JSON.stringify({ marker: "fixed" }),
        "utf8",
      );
      await target.write("later");
      expect(await storedMarker(target)).toBe("later");
    });
  },
);

describe.each(TARGETS)("locked-access read: $label", (target) => {
  it("rejects with the same error, not as an absent file, and saves nothing", async () => {
    const bytesBefore = await readText(target.file());
    const revisionBefore = await metadataRevision();
    const keysBefore = fileLockKeyCountForTests();
    // `writeSidecar` reads the prior sidecar for the entity rescan and must
    // not treat a locked project as "no prior sidecar".
    const locked = new ProjectLockedError("p");
    failReadsOf(target.file(), locked);
    const onMutate = vi.fn();
    const error = await target.write("failing", onMutate).then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBe(locked);
    expect(isLockedAccessError(error)).toBe(true);
    expect(onMutate).not.toHaveBeenCalled();
    vi.mocked(io.readFile).mockImplementation(realRead);
    await expectNothingSavedAndLockFree(
      target,
      bytesBefore,
      revisionBefore,
      keysBefore,
    );
    await target.write("later");
    expect(await storedMarker(target)).toBe("later");
  });
});

describe("single writer on an idle project (FR-13, FR-23)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(FROZEN_NOW));
  });

  it("the fixture covers every family A to E and S1 to S4, and exactly the scenarios in the scenario file", () => {
    expect(Object.keys(baseline).sort()).toEqual(Object.keys(SCENARIOS).sort());
    const families = new Set(Object.values(SCENARIOS).map((s) => s.family));
    expect([...families].sort()).toEqual(
      ["A", "B", "C", "D", "E", "S1", "S2", "S3", "S4"].sort(),
    );
  });

  it.each(Object.keys(SCENARIOS))(
    "%s: file bytes, return value and error match the unchanged tree",
    async (name) => {
      const snapshot = await runScenario(name);
      const expected = (baseline as Record<string, ScenarioSnapshot>)[name];
      // Compared field by field so a failure names the field that differs.
      expect(snapshot.error).toEqual(expected.error);
      expect(snapshot.returned).toBe(expected.returned);
      expect(snapshot.projectJson).toBe(expected.projectJson);
      expect(snapshot.sidecar).toBe(expected.sidecar);
      expect(snapshot.revision).toBe(expected.revision);
    },
  );
});
