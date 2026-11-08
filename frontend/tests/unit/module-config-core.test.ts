/**
 * Feature 103 Task 8: module-config-core.ts, the storage operation that writes
 * `config.modules[moduleId]`. Validation happens before any lock or write;
 * only the changed `config.modules` entry changes; locked-access errors
 * propagate unchanged.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { createProjectJsonWriteProbe } from "../helpers/projectJsonWriteProbe";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
} from "../../src/lib/models/io";
import {
  setModuleEnabledCore,
  InvalidModuleSwitchError,
  InvalidProjectIdCoreError,
  MODULE_SWITCH_MESSAGES,
} from "../../src/lib/models/module-config-core";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "44444444-4444-4444-8444-444444444444";
const TENANT = "/ws-module-core";
const ROOT = `${TENANT}/${PID}`;
const projectJson = (config: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: PID,
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    config,
  });
const readProject = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(`${ROOT}/project.json`, "utf8"));

describe("module-config-core (Feature 103 Task 8)", () => {
  const prevEnv = process.env.GETWRITE_PROJECTS_DIR;
  beforeEach(async () => {
    process.env.GETWRITE_PROJECTS_DIR = TENANT;
    setStorageAdapter(createMemoryAdapter());
    await mkdir(ROOT, { recursive: true });
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ features: { timeline: true }, statuses: ["a"] }),
      "utf8",
    );
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = prevEnv;
  });

  it("sets one entry and touches no other part of project.json", async () => {
    const before = await readProject();
    const stored = await setModuleEnabledCore({
      projectId: PID,
      moduleId: "sources",
      enabled: false,
    });
    expect(stored).toEqual({ modules: { sources: false } });
    const after = await readProject();
    const config = after.config as Record<string, unknown>;
    expect(config.modules).toEqual({ sources: false });
    delete config.modules;
    expect(after).toEqual(before);
  });

  it("keeps entries for other and unknown module ids", async () => {
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ modules: { future: true, other: false } }),
      "utf8",
    );
    await setModuleEnabledCore({
      projectId: PID,
      moduleId: "sources",
      enabled: true,
    });
    expect(
      ((await readProject()).config as { modules: unknown }).modules,
    ).toEqual({ future: true, other: false, sources: true });
  });

  it("does not bump updatedAt or metadataRevision", async () => {
    await setModuleEnabledCore({
      projectId: PID,
      moduleId: "sources",
      enabled: false,
    });
    const project = await readProject();
    expect("updatedAt" in project).toBe(false);
    expect("metadataRevision" in (project.config as object)).toBe(false);
  });

  it("refuses a bad project id before any write", async () => {
    for (const projectId of ["nope", "../etc", "", 7, null]) {
      await expect(
        setModuleEnabledCore({ projectId, moduleId: "sources", enabled: true }),
      ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
    }
  });

  it("refuses a bad module id", async () => {
    const before = await readFile(`${ROOT}/project.json`, "utf8");
    for (const moduleId of [
      "",
      "Sources",
      "a/b",
      "..",
      "__proto__",
      "a b",
      "x".repeat(65),
      7,
      null,
      undefined,
    ]) {
      const err = await setModuleEnabledCore({
        projectId: PID,
        moduleId,
        enabled: true,
      }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(InvalidModuleSwitchError);
      expect((err as Error).message).toBe(MODULE_SWITCH_MESSAGES.moduleId);
    }
    expect(await readFile(`${ROOT}/project.json`, "utf8")).toBe(before);
  });

  it("refuses a non-boolean enabled", async () => {
    for (const enabled of ["true", 1, null, undefined]) {
      await expect(
        setModuleEnabledCore({ projectId: PID, moduleId: "sources", enabled }),
      ).rejects.toThrow(MODULE_SWITCH_MESSAGES.enabled);
    }
  });

  it("refuses an unknown key and a non-object input, writing nothing", async () => {
    const before = await readFile(`${ROOT}/project.json`, "utf8");
    await expect(
      setModuleEnabledCore({
        projectId: PID,
        moduleId: "sources",
        enabled: true,
        path: "/tmp/x",
      }),
    ).rejects.toThrow(MODULE_SWITCH_MESSAGES.unknownKey);
    for (const input of [null, "x", 3, [PID], undefined]) {
      await expect(setModuleEnabledCore(input)).rejects.toThrow(
        MODULE_SWITCH_MESSAGES.shape,
      );
    }
    expect(await readFile(`${ROOT}/project.json`, "utf8")).toBe(before);
  });

  it("never echoes client input in a refusal message", async () => {
    const err = await setModuleEnabledCore({
      projectId: PID,
      moduleId: "SECRET-VALUE",
      enabled: true,
      "SECRET-KEY": 1,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as Error).message).not.toContain("SECRET");
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
    const err = await setModuleEnabledCore({
      projectId: PID,
      moduleId: "sources",
      enabled: false,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(err)).toBe(true);
  });

  it("writes an unlocked-keyring encrypted project and reads it back", async () => {
    const base = createMemoryAdapter();
    await base.mkdir(ROOT, { recursive: true });
    const keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(PID);
    await writeProjectMarker(ROOT, base);
    setStorageAdapter(workspaceEncryptionAdapter(base, TENANT, keyring));
    await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
    await setModuleEnabledCore({
      projectId: PID,
      moduleId: "sources",
      enabled: false,
    });
    expect(
      ((await readProject()).config as { modules: unknown }).modules,
    ).toEqual({ sources: false });
    // The bytes the underlying store holds are not the plain JSON.
    const raw = await base.readFileBuffer(`${ROOT}/project.json`);
    expect(Buffer.from(raw).toString("utf8")).not.toContain('"sources"');
  });

  it("writes project.json inside the per-file lock", async () => {
    const probe = createProjectJsonWriteProbe();
    setStorageAdapter(probe.adapter);
    await mkdir(ROOT, { recursive: true });
    await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
    await setModuleEnabledCore({
      projectId: PID,
      moduleId: "sources",
      enabled: false,
    });
    expect(probe.lockKeysAtWrite.slice(-1)).toEqual([1]);
  });
});
