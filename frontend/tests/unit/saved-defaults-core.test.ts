/**
 * Feature 101 Task 3: saved-defaults setter cores (FR-2, FR-32).
 * `setCompileDefaultsCore` / `setExportDefaultsCore` validate before any lock
 * or write, collapse duplicates, delete the key on clear, touch only their
 * own key and rethrow locked-access errors unchanged.
 */
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
  setCompileDefaultsCore,
  setExportDefaultsCore,
  InvalidSavedDefaultsError,
  InvalidProjectIdCoreError,
  SAVED_DEFAULTS_MAX_IDS,
  SAVED_DEFAULTS_MESSAGES,
} from "../../src/lib/models/saved-defaults-core";
import { generateUUID } from "../../src/lib/models/uuid";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "44444444-4444-4444-8444-444444444444";
const TENANT = "/ws-sd-core";
const ROOT = `${TENANT}/${PID}`;
const A = generateUUID();
const B = generateUUID();
const projectJson = (config: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: PID,
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    config,
  });
const readConfig = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(`${ROOT}/project.json`, "utf8")).config;

type Setter = (
  projectId: string,
  ids: unknown,
) => Promise<{ excludedResourceIds: string[] | undefined }>;

const CASES: ReadonlyArray<{
  key: "compileDefaults" | "exportDefaults";
  other: "compileDefaults" | "exportDefaults";
  set: Setter;
}> = [
  {
    key: "compileDefaults",
    other: "exportDefaults",
    set: setCompileDefaultsCore,
  },
  {
    key: "exportDefaults",
    other: "compileDefaults",
    set: setExportDefaultsCore,
  },
];

describe.each(CASES)("saved-defaults core: $key", ({ key, other, set }) => {
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

  it("stores the ids under its own key", async () => {
    const out = await set(PID, [A, B]);
    expect(out).toEqual({ excludedResourceIds: [A, B] });
    expect((await readConfig())[key]).toEqual({ excludedResourceIds: [A, B] });
  });

  it("collapses duplicates, keeping first-seen order", async () => {
    const out = await set(PID, [B, A, B, A]);
    expect(out.excludedResourceIds).toEqual([B, A]);
    expect((await readConfig())[key]).toEqual({ excludedResourceIds: [B, A] });
  });

  it("refuses non-array, non-string, non-UUID and over-cap input with a message and stores nothing", async () => {
    const tooMany = Array.from({ length: SAVED_DEFAULTS_MAX_IDS + 1 }, () =>
      generateUUID(),
    );
    const cases: ReadonlyArray<[unknown, string]> = [
      [undefined, SAVED_DEFAULTS_MESSAGES.notArray],
      ["abc", SAVED_DEFAULTS_MESSAGES.notArray],
      [{ excludedResourceIds: [A] }, SAVED_DEFAULTS_MESSAGES.notArray],
      [[A, 7], SAVED_DEFAULTS_MESSAGES.notString],
      [[A, null], SAVED_DEFAULTS_MESSAGES.notString],
      [[A, "not-a-uuid"], SAVED_DEFAULTS_MESSAGES.notUuid],
      [tooMany, SAVED_DEFAULTS_MESSAGES.tooMany],
    ];
    const before = await readFile(`${ROOT}/project.json`, "utf8");
    for (const [bad, message] of cases) {
      const err = await set(PID, bad).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(InvalidSavedDefaultsError);
      expect((err as InvalidSavedDefaultsError).message).toBe(message);
    }
    expect(await readFile(`${ROOT}/project.json`, "utf8")).toBe(before);
  });

  it("accepts exactly the cap", async () => {
    const atCap = Array.from({ length: SAVED_DEFAULTS_MAX_IDS }, () =>
      generateUUID(),
    );
    const out = await set(PID, atCap);
    expect(out.excludedResourceIds).toHaveLength(SAVED_DEFAULTS_MAX_IDS);
  });

  it("validates before taking any lock or write", async () => {
    const probe = createProjectJsonWriteProbe();
    setStorageAdapter(probe.adapter);
    await mkdir(ROOT, { recursive: true });
    await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
    const writesBefore = probe.lockKeysAtWrite.length;
    await expect(set(PID, ["x"])).rejects.toBeInstanceOf(
      InvalidSavedDefaultsError,
    );
    expect(probe.lockKeysAtWrite.length).toBe(writesBefore);
  });

  it("clear (null) deletes the key, never null or {}", async () => {
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ [key]: { excludedResourceIds: [A] }, maxRevisions: 9 }),
      "utf8",
    );
    expect(await set(PID, null)).toEqual({ excludedResourceIds: undefined });
    const cfg = await readConfig();
    expect(key in cfg).toBe(false);
    expect(cfg).toEqual({ maxRevisions: 9 });
  });

  it("leaves the other key, goalFilter and every other config key byte-equal", async () => {
    const untouched = {
      [other]: { excludedResourceIds: [B] },
      goalFilter: { op: "eq", field: "status", value: "draft" },
      wordCountGoal: 5,
      dailyWordGoal: 6,
      maxRevisions: 9,
      tags: [{ id: A, name: "t" }],
    };
    await writeFile(`${ROOT}/project.json`, projectJson(untouched), "utf8");
    const pick = (cfg: Record<string, unknown>): string =>
      JSON.stringify(Object.keys(untouched).map((k) => [k, cfg[k]] as const));
    const before = pick(await readConfig());
    await set(PID, [A]);
    expect(pick(await readConfig())).toBe(before);
    await set(PID, null);
    expect(pick(await readConfig())).toBe(before);
  });

  it("derives the root from projectId and takes no path argument", async () => {
    expect(set.length).toBe(2);
    await expect(set("nope", [A])).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
    await expect(set("../etc", [A])).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
  });

  it("rethrows locked-access errors unchanged", async () => {
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
    const err = await set(PID, [A]).then(
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
    await set(PID, [A]);
    expect(probe.lockKeysAtWrite.slice(-1)).toEqual([1]);
  });
});
