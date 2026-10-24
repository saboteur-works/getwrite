import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { createProjectJsonWriteProbe } from "../helpers/projectJsonWriteProbe";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
} from "../../src/lib/models/io";
import {
  setWordCountGoalCore,
  InvalidWordCountGoalError,
  InvalidProjectIdCoreError,
} from "../../src/lib/models/word-count-goal-core";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "22222222-2222-4222-8222-222222222222";
const TENANT = "/ws-wcg-core";
const ROOT = `${TENANT}/${PID}`;
const projectJson = (config: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: PID,
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    config,
  });

describe("word-count-goal-core (Feature 61 Task 2)", () => {
  const prevEnv = process.env.GETWRITE_PROJECTS_DIR;
  beforeEach(async () => {
    process.env.GETWRITE_PROJECTS_DIR = TENANT;
    setStorageAdapter(createMemoryAdapter());
    await mkdir(ROOT, { recursive: true });
    await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = prevEnv;
  });

  it("set persists and clear removes wordCountGoal without touching dailyWordGoal or other keys", async () => {
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ dailyWordGoal: 250, maxRevisions: 9 }),
      "utf8",
    );
    expect(await setWordCountGoalCore(PID, 80000)).toEqual({
      wordCountGoal: 80000,
    });
    let cfg = JSON.parse(await readFile(`${ROOT}/project.json`, "utf8")).config;
    expect(cfg).toMatchObject({
      wordCountGoal: 80000,
      dailyWordGoal: 250,
      maxRevisions: 9,
    });
    expect(await setWordCountGoalCore(PID, null)).toEqual({
      wordCountGoal: undefined,
    });
    cfg = JSON.parse(await readFile(`${ROOT}/project.json`, "utf8")).config;
    expect("wordCountGoal" in cfg).toBe(false);
    expect(cfg.dailyWordGoal).toBe(250);
    expect(cfg.maxRevisions).toBe(9);
  });

  it("accepts 0 and rejects negative and non-integer values", async () => {
    await expect(setWordCountGoalCore(PID, 0)).resolves.toEqual({
      wordCountGoal: 0,
    });
    for (const bad of [-1, 1.5, NaN, Infinity]) {
      await expect(setWordCountGoalCore(PID, bad)).rejects.toBeInstanceOf(
        InvalidWordCountGoalError,
      );
    }
  });

  it("rejects a malformed projectId", async () => {
    await expect(setWordCountGoalCore("nope", 100)).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
  });

  it("rethrows locked-access errors on set", async () => {
    const base = createMemoryAdapter();
    await base.mkdir(ROOT, { recursive: true });
    const keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(PID);
    await writeProjectMarker(ROOT, base);
    keyring.lock();
    setStorageAdapter(workspaceEncryptionAdapter(base, TENANT, keyring));
    const err = await setWordCountGoalCore(PID, 5).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(err)).toBe(true);
  });
  describe("project.json write (Feature 92 Task 14)", () => {
    const prevDurable = process.env.GETWRITE_DURABLE_META;
    afterEach(() => {
      if (prevDurable === undefined) delete process.env.GETWRITE_DURABLE_META;
      else process.env.GETWRITE_DURABLE_META = prevDurable;
    });

    it("writes project.json inside the per-file lock, with no added updatedAt", async () => {
      const probe = createProjectJsonWriteProbe();
      setStorageAdapter(probe.adapter);
      await mkdir(ROOT, { recursive: true });
      await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
      await setWordCountGoalCore(PID, 5);
      expect(probe.lockKeysAtWrite.slice(-1)).toEqual([1]);
      const written = JSON.parse(
        await readFile(`${ROOT}/project.json`, "utf8"),
      );
      expect(written.config).toHaveProperty("wordCountGoal");
      expect(written).not.toHaveProperty("updatedAt");
    });

    it("fsyncs the write only when GETWRITE_DURABLE_META is 1", async () => {
      const probe = createProjectJsonWriteProbe();
      setStorageAdapter(probe.adapter);
      await mkdir(ROOT, { recursive: true });
      await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
      delete process.env.GETWRITE_DURABLE_META;
      await setWordCountGoalCore(PID, 5);
      expect(probe.fsyncs).toEqual([]);
      process.env.GETWRITE_DURABLE_META = "1";
      await setWordCountGoalCore(PID, 5);
      expect(probe.fsyncs).toHaveLength(1);
      expect(probe.fsyncs[0]).toContain("project.json");
    });
  });
});
