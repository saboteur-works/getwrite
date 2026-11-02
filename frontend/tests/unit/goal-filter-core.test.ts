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
  setGoalFilterCore,
  InvalidGoalFilterError,
  InvalidProjectIdCoreError,
} from "../../src/lib/models/goal-filter-core";
import {
  validateGoalFilter,
  GOAL_FILTER_BOUNDS,
} from "../../src/lib/models/goal-filter-validation";
import { setWordCountGoalCore } from "../../src/lib/models/word-count-goal-core";
import { setDailyWordGoalCore } from "../../src/lib/models/writing-log-core";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "33333333-3333-4333-8333-333333333333";
const TENANT = "/ws-gf-core";
const ROOT = `${TENANT}/${PID}`;
const projectJson = (config: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: PID,
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    config,
  });
const readConfig = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(`${ROOT}/project.json`, "utf8")).config;

const VALID = { op: "eq", field: "status", value: "draft" };
const nest = (depth: number): unknown => {
  let node: unknown = VALID;
  for (let i = 1; i < depth; i += 1) node = { op: "not", child: node };
  return node;
};

describe("goal-filter-core (Feature 98 Task 4)", () => {
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

  it("stores a valid filter under config.goalFilter", async () => {
    const out = await setGoalFilterCore(PID, VALID);
    expect(out).toEqual({ goalFilter: VALID });
    expect((await readConfig()).goalFilter).toEqual(VALID);
  });

  it("refuses each Task 1 refusal with the validator's text and writes nothing", async () => {
    const cases: unknown[] = [
      { op: "bogus" },
      { op: "ref", name: "saved" },
      { op: "param", name: "p" },
      { op: "and", children: [] },
      nest(GOAL_FILTER_BOUNDS.maxDepth + 1),
      {
        op: "and",
        children: Array.from(
          { length: GOAL_FILTER_BOUNDS.maxConditions + 1 },
          () => VALID,
        ),
      },
      { op: "gte", field: "createdAt", value: { amount: 7, unit: "days" } },
    ];
    const before = await readFile(`${ROOT}/project.json`, "utf8");
    for (const bad of cases) {
      const v = validateGoalFilter(bad);
      expect(v.ok).toBe(false);
      if (v.ok) continue;
      const err = await setGoalFilterCore(PID, bad).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(InvalidGoalFilterError);
      expect((err as InvalidGoalFilterError).message).toBe(v.message);
      expect((err as InvalidGoalFilterError).reason).toBe(v.reason);
    }
    expect(await readFile(`${ROOT}/project.json`, "utf8")).toBe(before);
  });

  it("clear removes the key, not null or an empty AST, and keeps both goals", async () => {
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({
        goalFilter: VALID,
        wordCountGoal: 80000,
        dailyWordGoal: 250,
        maxRevisions: 9,
      }),
      "utf8",
    );
    expect(await setGoalFilterCore(PID, null)).toEqual({
      goalFilter: undefined,
    });
    const cfg = await readConfig();
    expect("goalFilter" in cfg).toBe(false);
    expect(cfg).toEqual({
      wordCountGoal: 80000,
      dailyWordGoal: 250,
      maxRevisions: 9,
    });
  });

  it("setting a filter touches no other key", async () => {
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ wordCountGoal: 5, dailyWordGoal: 6, maxRevisions: 9 }),
      "utf8",
    );
    await setGoalFilterCore(PID, VALID);
    expect(await readConfig()).toEqual({
      wordCountGoal: 5,
      dailyWordGoal: 6,
      maxRevisions: 9,
      goalFilter: VALID,
    });
  });

  it("setting or clearing either goal leaves the filter untouched", async () => {
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ goalFilter: VALID }),
      "utf8",
    );
    await setWordCountGoalCore(PID, 100);
    await setDailyWordGoalCore(PID, 20);
    expect((await readConfig()).goalFilter).toEqual(VALID);
    await setWordCountGoalCore(PID, null);
    await setDailyWordGoalCore(PID, null);
    expect(await readConfig()).toEqual({ goalFilter: VALID });
  });

  it("derives the root from projectId and takes no path argument", async () => {
    expect(setGoalFilterCore.length).toBe(2);
    await expect(setGoalFilterCore("nope", VALID)).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
    await expect(setGoalFilterCore("../etc", VALID)).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
  });

  it("rethrows locked-access errors", async () => {
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
    const err = await setGoalFilterCore(PID, VALID).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(err)).toBe(true);
  });

  it("writes project.json inside the per-file lock", async () => {
    const probe = createProjectJsonWriteProbe();
    setStorageAdapter(probe.adapter);
    await mkdir(ROOT, { recursive: true });
    await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
    await setGoalFilterCore(PID, VALID);
    expect(probe.lockKeysAtWrite.slice(-1)).toEqual([1]);
  });
});
